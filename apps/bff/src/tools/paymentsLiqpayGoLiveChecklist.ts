import { PrismaClient } from "@vendora/database";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

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

function normalizeBaseUrl(raw: string | undefined | null) {
  return (raw ?? "").trim().replace(/\/$/, "");
}

function redactWebhookUrl(url: string): string {
  return url.replace(/([?&]t=)[^&]+/, "$1<redacted>");
}

function firstWebhookToken(config: unknown): string | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) return null;
  const tokens = (config as any).webhookTokens;
  if (!Array.isArray(tokens)) return null;
  const first = typeof tokens[0] === "string" ? tokens[0].trim() : "";
  if (!first) return null;
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(first)) return null;
  return first;
}

function liqpayConfig(config: unknown): {
  publicKey: string | null;
  currentSecretRef: string | null;
  previousSecretRef: string | null;
  previousValidUntil: string | null;
  signatureOutAlgorithm: "sha1" | "sha3-256" | null;
  signatureInAlgorithms: Array<"sha1" | "sha3-256">;
  version: number | null;
} {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return {
      publicKey: null,
      currentSecretRef: null,
      previousSecretRef: null,
      previousValidUntil: null,
      signatureOutAlgorithm: null,
      signatureInAlgorithms: [],
      version: null,
    };
  }
  const liqpay = (config as any).liqpay;
  if (!liqpay || typeof liqpay !== "object" || Array.isArray(liqpay)) {
    return {
      publicKey: null,
      currentSecretRef: null,
      previousSecretRef: null,
      previousValidUntil: null,
      signatureOutAlgorithm: null,
      signatureInAlgorithms: [],
      version: null,
    };
  }
  const publicKey = typeof (liqpay as any).publicKey === "string" ? (liqpay as any).publicKey.trim() : "";
  const currentSecretRef = typeof (liqpay as any).currentSecretRef === "string" ? (liqpay as any).currentSecretRef.trim() : "";
  const previousSecretRef = typeof (liqpay as any).previousSecretRef === "string" ? (liqpay as any).previousSecretRef.trim() : "";
  const previousValidUntil = typeof (liqpay as any).previousValidUntil === "string" ? (liqpay as any).previousValidUntil.trim() : "";
  const signatureOutAlgorithmRaw = typeof (liqpay as any).signatureOutAlgorithm === "string" ? (liqpay as any).signatureOutAlgorithm.trim() : "";
  const signatureOutAlgorithm = signatureOutAlgorithmRaw === "sha1" || signatureOutAlgorithmRaw === "sha3-256" ? signatureOutAlgorithmRaw : null;
  const signatureInAlgorithmsRaw = (liqpay as any).signatureInAlgorithms;
  const signatureInAlgorithms = Array.isArray(signatureInAlgorithmsRaw)
    ? signatureInAlgorithmsRaw.filter((a: any) => a === "sha1" || a === "sha3-256")
    : [];
  const versionRaw = (liqpay as any).version;
  const version = Number.isFinite(Number(versionRaw)) ? Number(versionRaw) : null;
  return {
    publicKey: publicKey || null,
    currentSecretRef: currentSecretRef || null,
    previousSecretRef: previousSecretRef || null,
    previousValidUntil: previousValidUntil || null,
    signatureOutAlgorithm,
    signatureInAlgorithms,
    version,
  };
}

function requiredSecretRefs(cfg: ReturnType<typeof liqpayConfig>) {
  const refs: string[] = [];
  if (cfg.currentSecretRef) refs.push(cfg.currentSecretRef);
  if (cfg.previousSecretRef) {
    const untilMs = cfg.previousValidUntil ? Date.parse(cfg.previousValidUntil) : Number.NaN;
    const allowPrevious = !cfg.previousValidUntil || (Number.isFinite(untilMs) && untilMs > Date.now());
    if (allowPrevious) refs.push(cfg.previousSecretRef);
  }
  return refs;
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = envBool("PAYMENTS_GO_LIVE_ALLOW", false);
  assert(allow, "Refusing to run: set PAYMENTS_GO_LIVE_ALLOW=true");

  const tenantSlug = (process.env.TENANT_SLUG ?? "").trim();
  assert(tenantSlug, "TENANT_SLUG missing");

  const mode = ((process.env.PAYMENTS_MODE ?? "LIVE").trim().toUpperCase() === "TEST" ? "TEST" : "LIVE") as "TEST" | "LIVE";

  const webBase = normalizeBaseUrl(process.env.WEB_BASE_URL);
  assert(webBase, "WEB_BASE_URL missing");

  const requireActive = envBool("PAYMENTS_GO_LIVE_REQUIRE_ACTIVE", true);
  const requireSecret = envBool("PAYMENTS_GO_LIVE_REQUIRE_SECRET", true);
  const printWebhookUrl = envBool("PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL", false);

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new Error("Tenant not found");

    const provider = await prisma.paymentProvider.findUnique({
      where: { tenantId_type_mode: { tenantId: tenant.id, type: "LIQPAY", mode } },
      select: { id: true, tenantId: true, type: true, mode: true, status: true, config: true },
    });
    if (!provider) throw new Error("LiqPay provider not found for tenant/mode");

    if (requireActive && provider.status !== "ACTIVE") throw new Error("LiqPay provider is not ACTIVE");

    const token = firstWebhookToken(provider.config);
    assert(token, "Provider webhookTokens missing/invalid");

    const cfg = liqpayConfig(provider.config);
    assert(cfg.publicKey && cfg.currentSecretRef, "Provider liqpay.publicKey/currentSecretRef missing");
    assert(cfg.signatureOutAlgorithm, "Provider liqpay.signatureOutAlgorithm missing/invalid");
    assert(cfg.signatureInAlgorithms.length > 0, "Provider liqpay.signatureInAlgorithms missing/invalid");
    assert(cfg.version === 3, "Provider liqpay.version must be 3");

    if (requireSecret) {
      for (const ref of requiredSecretRefs(cfg)) {
        const value = (process.env[ref] ?? "").trim();
        if (!value) throw new Error(`Provider secret missing in environment (${ref} is unset)`);
      }
    }

    const webhookUrlViaWeb = `${webBase}/api/webhooks/payments/liqpay/${provider.id}?t=${encodeURIComponent(token)}`;
    const webhookUrlOut = printWebhookUrl ? webhookUrlViaWeb : redactWebhookUrl(webhookUrlViaWeb);

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        tool: "paymentsLiqpayGoLiveChecklist",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        mode,
        provider: {
          id: provider.id,
          status: provider.status,
          hasConfig: !!provider.config,
          liqpay: {
            hasPublicKey: !!cfg.publicKey,
            signatureOutAlgorithm: cfg.signatureOutAlgorithm,
            signatureInAlgorithms: cfg.signatureInAlgorithms,
            version: cfg.version,
            currentSecretRef: cfg.currentSecretRef,
            previousSecretRef: cfg.previousSecretRef,
            previousValidUntil: cfg.previousValidUntil,
            requiredSecretRefs: requiredSecretRefs(cfg),
          },
        },
        webhookUrlViaWeb: webhookUrlOut,
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

