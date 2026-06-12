import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { PrismaClient } from "@vendora/database";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "") return defaultValue;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return defaultValue;
}

function normalizeEnvString(value: string | undefined) {
  const v = value?.trim();
  return v ? v : null;
}

function safeDbHost(): string | null {
  const url = normalizeEnvString(process.env.DATABASE_URL);
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

function hasWebhookTokens(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const tokens = (config as any).webhookTokens;
  if (!Array.isArray(tokens)) return false;
  const first = typeof tokens[0] === "string" ? tokens[0].trim() : "";
  return /^[A-Za-z0-9_-]{16,128}$/.test(first);
}

function monobankPubkeysCount(config: unknown): number {
  if (!config || typeof config !== "object" || Array.isArray(config)) return 0;
  const monobank = (config as any).monobank;
  if (!monobank || typeof monobank !== "object" || Array.isArray(monobank)) return 0;
  const keys = (monobank as any).webhookPublicKeysPem;
  if (!Array.isArray(keys)) return 0;
  return keys.filter((k: any) => typeof k === "string" && k.includes("BEGIN PUBLIC KEY")).length;
}

function liqpayConfigSummary(config: unknown): {
  hasPublicKey: boolean;
  currentSecretRef: string | null;
  signatureOutAlgorithm: "sha1" | "sha3-256" | null;
  signatureInAlgorithmsCount: number;
  version: number | null;
} {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { hasPublicKey: false, currentSecretRef: null, signatureOutAlgorithm: null, signatureInAlgorithmsCount: 0, version: null };
  }
  const liqpay = (config as any).liqpay;
  if (!liqpay || typeof liqpay !== "object" || Array.isArray(liqpay)) {
    return { hasPublicKey: false, currentSecretRef: null, signatureOutAlgorithm: null, signatureInAlgorithmsCount: 0, version: null };
  }
  const publicKey = typeof (liqpay as any).publicKey === "string" ? (liqpay as any).publicKey.trim() : "";
  const currentSecretRef = typeof (liqpay as any).currentSecretRef === "string" ? (liqpay as any).currentSecretRef.trim() : "";
  const signatureOutAlgorithmRaw = typeof (liqpay as any).signatureOutAlgorithm === "string" ? (liqpay as any).signatureOutAlgorithm.trim() : "";
  const signatureOutAlgorithm =
    signatureOutAlgorithmRaw === "sha1" || signatureOutAlgorithmRaw === "sha3-256" ? (signatureOutAlgorithmRaw as any) : null;
  const signatureInAlgorithmsRaw = (liqpay as any).signatureInAlgorithms;
  const signatureInAlgorithms = Array.isArray(signatureInAlgorithmsRaw)
    ? signatureInAlgorithmsRaw.filter((a: any) => a === "sha1" || a === "sha3-256")
    : [];
  const versionRaw = (liqpay as any).version;
  const version = Number.isFinite(Number(versionRaw)) ? Number(versionRaw) : null;
  return {
    hasPublicKey: !!publicKey,
    currentSecretRef: currentSecretRef || null,
    signatureOutAlgorithm,
    signatureInAlgorithmsCount: signatureInAlgorithms.length,
    version,
  };
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = envBool("PAYMENTS_CLEANUP_AUDIT_ALLOW", false);
  assert(allow, "Refusing to run: set PAYMENTS_CLEANUP_AUDIT_ALLOW=true");

  const dbHost = safeDbHost();
  const allowNonLocalDb = envBool("PAYMENTS_CLEANUP_AUDIT_ALLOW_NONLOCAL_DB", false);
  const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1";
  assert(isLocalDb || allowNonLocalDb, `Refusing to run on non-local DATABASE_URL host (${dbHost ?? "unknown"}). Set PAYMENTS_CLEANUP_AUDIT_ALLOW_NONLOCAL_DB=true if intended.`);

  const protectedTenantSlug = (process.env.PAYMENTS_PROTECTED_TENANT_SLUG ?? "berlin-press").trim();
  assert(protectedTenantSlug, "PAYMENTS_PROTECTED_TENANT_SLUG empty");

  const zzPrefix = (process.env.PAYMENTS_TEST_TENANT_PREFIX ?? "zz-").trim();
  assert(zzPrefix, "PAYMENTS_TEST_TENANT_PREFIX empty");

  const prisma = new PrismaClient();
  try {
    const zzTenants = await prisma.tenant.findMany({
      where: { slug: { startsWith: zzPrefix } },
      select: { id: true, slug: true, name: true, createdAt: true, updatedAt: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });

    const protectedTenant = await prisma.tenant.findUnique({
      where: { slug: protectedTenantSlug },
      select: { id: true, slug: true },
    });

    const protectedTenantActiveProviders = protectedTenant
      ? await prisma.paymentProvider.findMany({
          where: { tenantId: protectedTenant.id, status: "ACTIVE" },
          select: { id: true, type: true, mode: true, status: true, credentialsRef: true, config: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : [];

    const zzTenantIds = zzTenants.map((t) => t.id);
    const zzProviders = zzTenantIds.length
      ? await prisma.paymentProvider.findMany({
          where: { tenantId: { in: zzTenantIds } },
          select: { id: true, tenantId: true, type: true, mode: true, status: true, credentialsRef: true, config: true, createdAt: true, updatedAt: true },
          orderBy: [{ tenantId: "asc" }, { createdAt: "asc" }],
          take: 500,
        })
      : [];

    const providersByTenant: Record<string, any[]> = {};
    for (const p of zzProviders) {
      (providersByTenant[p.tenantId] ??= []).push({
        id: p.id,
        type: p.type,
        mode: p.mode,
        status: p.status,
        credentialsRef: p.credentialsRef ?? null,
        hasWebhookTokens: hasWebhookTokens(p.config),
        monobankPubkeysCount: p.type === "MONOBANK" ? monobankPubkeysCount(p.config) : null,
        liqpay:
          p.type === "LIQPAY"
            ? (() => {
                const liq = liqpayConfigSummary(p.config);
                return {
                  hasPublicKey: liq.hasPublicKey,
                  currentSecretRef: liq.currentSecretRef,
                  signatureOutAlgorithm: liq.signatureOutAlgorithm,
                  signatureInAlgorithmsCount: liq.signatureInAlgorithmsCount,
                  version: liq.version,
                };
              })()
            : null,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      });
    }

    const zzActiveProviders = zzProviders
      .filter((p) => p.status === "ACTIVE")
      .map((p) => ({ id: p.id, tenantId: p.tenantId, type: p.type, mode: p.mode }));

    const secretRefs = [
      "ZZ_MOLLIE_API_KEY_TEST",
      "ZZ_MONOBANK_X_TOKEN",
      "ZZ_LIQPAY_PRIVATE_KEY",
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ];
    const secretRefsPresent = secretRefs
      .map((name) => ({ name, present: !!normalizeEnvString(process.env[name]) }))
      .filter((x) => x.present)
      .map((x) => x.name);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          tool: "paymentsCleanupAudit",
          db: { host: dbHost, local: isLocalDb },
          protectedTenant: { slug: protectedTenantSlug, exists: !!protectedTenant, activeProvidersCount: protectedTenantActiveProviders.length },
          protectedTenantActiveProviders: protectedTenantActiveProviders.map((p) => ({
            id: p.id,
            type: p.type,
            mode: p.mode,
            status: p.status,
            credentialsRef: p.credentialsRef ?? null,
            hasWebhookTokens: hasWebhookTokens(p.config),
          })),
          zz: {
            prefix: zzPrefix,
            tenantsCount: zzTenants.length,
            providersCount: zzProviders.length,
            activeProvidersCount: zzActiveProviders.length,
            activeProviders: zzActiveProviders,
            tenants: zzTenants.map((t) => ({
              id: t.id,
              slug: t.slug,
              name: t.name,
              providers: providersByTenant[t.id] ?? [],
            })),
          },
          env: {
            presentVars: secretRefsPresent,
            note: "Values are never printed by this tool.",
          },
          next:
            zzActiveProviders.length > 0 || protectedTenantActiveProviders.length > 0
              ? [
                  "If any ACTIVE providers are shown above, disable them before continuing any tests.",
                  "Do not touch protected tenant unless explicitly intended.",
                ]
              : ["No ACTIVE providers detected for zz-* tenants, and protected tenant has no ACTIVE providers (good)."],
        },
        null,
        2
      )
    );
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

