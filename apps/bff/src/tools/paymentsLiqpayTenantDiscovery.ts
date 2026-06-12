import { PrismaClient } from "@vendora/database";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function firstWebhookTokenPresent(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const tokens = (config as any).webhookTokens;
  if (!Array.isArray(tokens)) return false;
  const first = typeof tokens[0] === "string" ? tokens[0].trim() : "";
  return /^[A-Za-z0-9_-]{16,128}$/.test(first);
}

function liqpayConfigSummary(config: unknown): {
  hasPublicKey: boolean;
  currentSecretRef: string | null;
  previousSecretRef: string | null;
  previousValidUntil: string | null;
  signatureOutAlgorithm: string | null;
  signatureInAlgorithmsCount: number;
  version: number | null;
} {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      hasPublicKey: false,
      currentSecretRef: null,
      previousSecretRef: null,
      previousValidUntil: null,
      signatureOutAlgorithm: null,
      signatureInAlgorithmsCount: 0,
      version: null,
    };
  }
  const liqpay = (config as any).liqpay;
  if (!liqpay || typeof liqpay !== "object" || Array.isArray(liqpay)) {
    return {
      hasPublicKey: false,
      currentSecretRef: null,
      previousSecretRef: null,
      previousValidUntil: null,
      signatureOutAlgorithm: null,
      signatureInAlgorithmsCount: 0,
      version: null,
    };
  }
  const publicKey = typeof (liqpay as any).publicKey === "string" ? (liqpay as any).publicKey.trim() : "";
  const currentSecretRef = typeof (liqpay as any).currentSecretRef === "string" ? (liqpay as any).currentSecretRef.trim() : "";
  const previousSecretRef = typeof (liqpay as any).previousSecretRef === "string" ? (liqpay as any).previousSecretRef.trim() : "";
  const previousValidUntil = typeof (liqpay as any).previousValidUntil === "string" ? (liqpay as any).previousValidUntil.trim() : "";
  const signatureOutAlgorithm = typeof (liqpay as any).signatureOutAlgorithm === "string" ? (liqpay as any).signatureOutAlgorithm.trim() : "";
  const signatureInAlgorithmsRaw = (liqpay as any).signatureInAlgorithms;
  const signatureInAlgorithms = Array.isArray(signatureInAlgorithmsRaw)
    ? signatureInAlgorithmsRaw.filter((a: any) => a === "sha1" || a === "sha3-256")
    : [];
  const versionRaw = (liqpay as any).version;
  const version = Number.isFinite(Number(versionRaw)) ? Number(versionRaw) : null;
  return {
    hasPublicKey: !!publicKey,
    currentSecretRef: currentSecretRef || null,
    previousSecretRef: previousSecretRef || null,
    previousValidUntil: previousValidUntil || null,
    signatureOutAlgorithm: signatureOutAlgorithm || null,
    signatureInAlgorithmsCount: signatureInAlgorithms.length,
    version,
  };
}

function requiredSecretRefs(summary: ReturnType<typeof liqpayConfigSummary>): string[] {
  const refs: string[] = [];
  if (summary.currentSecretRef) refs.push(summary.currentSecretRef);
  if (summary.previousSecretRef) {
    const untilMs = summary.previousValidUntil ? Date.parse(summary.previousValidUntil) : Number.NaN;
    const allowPrevious = !summary.previousValidUntil || (Number.isFinite(untilMs) && untilMs > Date.now());
    if (allowPrevious) refs.push(summary.previousSecretRef);
  }
  return refs;
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = (process.env.PAYMENTS_GO_LIVE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_GO_LIVE_ALLOW=true");

  const excludeSlug = (process.env.PAYMENTS_GO_LIVE_EXCLUDE_TENANT_SLUG ?? "berlin-press").trim();
  const mode = ((process.env.PAYMENTS_MODE ?? "LIVE").trim().toUpperCase() === "TEST" ? "TEST" : "LIVE") as "TEST" | "LIVE";

  const prisma = new PrismaClient();
  try {
    const providers = await prisma.paymentProvider.findMany({
      where: { type: "LIQPAY", mode },
      select: { id: true, status: true, config: true, tenantId: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    const tenantIds = [...new Set(providers.map((p) => p.tenantId))];
    const tenants = await prisma.tenant.findMany({
      where: { id: { in: tenantIds } },
      select: { id: true, slug: true },
    });
    const slugByTenantId = new Map(tenants.map((t) => [t.id, t.slug] as const));

    const rows = providers
      .map((p) => {
        const tenantSlug = slugByTenantId.get(p.tenantId) ?? null;
        const liq = liqpayConfigSummary(p.config);
        const refs = requiredSecretRefs(liq);
        return {
          tenantSlug,
          providerId: p.id,
          mode,
          status: p.status,
          hasWebhookToken: firstWebhookTokenPresent(p.config),
          liqpay: liq,
          requiredSecretRefs: refs,
          secretsPresentInEnv: refs.every((r) => !!(process.env[r] ?? "").trim()),
        };
      })
      .filter((r) => !!r.tenantSlug && r.tenantSlug !== excludeSlug);

    const candidates = rows
      .filter(
        (r) =>
          r.status === "ACTIVE" &&
          r.hasWebhookToken &&
          r.liqpay.hasPublicKey &&
          !!r.liqpay.currentSecretRef &&
          r.liqpay.signatureInAlgorithmsCount > 0 &&
          (r.liqpay.signatureOutAlgorithm === "sha1" || r.liqpay.signatureOutAlgorithm === "sha3-256") &&
          r.liqpay.version === 3 &&
          r.secretsPresentInEnv
      )
      .slice(0, 20);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        tool: "paymentsLiqpayTenantDiscovery",
        mode,
        excludeSlug,
        candidates,
        summary: {
          scannedProviders: providers.length,
          tenantsResolved: tenants.length,
          totalUsable: candidates.length,
        },
        all: rows.slice(0, 50),
      })
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

