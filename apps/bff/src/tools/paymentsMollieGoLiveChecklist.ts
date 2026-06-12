import { PrismaClient } from "@vendora/database";
import { fetchJsonWithMeta, UpstreamHttpError } from "../services/http.js";
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

async function probeMollieApiKey(apiKey: string) {
  const base = "https://api.mollie.com";
  try {
    const res = await fetchJsonWithMeta<any>(
      `${base}/v2/payments?limit=1`,
      {
        timeoutMs: 6_000,
        retries: 0,
        backoffMs: 0,
        headers: { authorization: `Bearer ${apiKey}` },
        op: "mollie.probe",
      }
    );
    return { ok: true as const, status: res.status };
  } catch (e: unknown) {
    const up = e instanceof UpstreamHttpError ? e : null;
    const status = up?.status ?? null;
    if (status === 401 || status === 403) return { ok: false as const, code: "AUTH_FAILED" as const, status };
    if (status === 429 || status === null || (typeof status === "number" && status >= 500)) {
      return { ok: false as const, code: "TRANSIENT" as const, status };
    }
    return { ok: false as const, code: "UNKNOWN" as const, status };
  }
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
  const printWebhookUrl = envBool("PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL", false);
  const probeUpstream = envBool("PAYMENTS_GO_LIVE_PROBE_UPSTREAM", false);

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) {
      throw new Error("Tenant not found");
    }

    const provider = await prisma.paymentProvider.findUnique({
      where: { tenantId_type_mode: { tenantId: tenant.id, type: "MOLLIE", mode } },
      select: { id: true, tenantId: true, type: true, mode: true, status: true, credentialsRef: true, config: true },
    });
    if (!provider) {
      throw new Error("Mollie provider not found for tenant/mode");
    }

    if (requireActive && provider.status !== "ACTIVE") {
      throw new Error("Mollie provider is not ACTIVE");
    }

    const token = firstWebhookToken(provider.config);
    assert(token, "Provider webhookTokens missing/invalid");

    const credentialsRef = (provider.credentialsRef ?? "").trim();
    assert(credentialsRef, "Provider credentialsRef missing");

    const apiKey = (process.env[credentialsRef] ?? "").trim();
    assert(apiKey, "Provider secret missing in environment (credentialsRef points to unset env var)");

    const webhookUrlViaWeb = `${webBase}/api/webhooks/payments/mollie/${provider.id}?t=${encodeURIComponent(token)}`;
    const webhookUrlOut = printWebhookUrl ? webhookUrlViaWeb : redactWebhookUrl(webhookUrlViaWeb);

    const upstream = probeUpstream ? await probeMollieApiKey(apiKey) : { ok: true as const, skipped: true as const };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true,
      tool: "paymentsMollieGoLiveChecklist",
      tenantId: tenant.id,
      tenantSlug: tenant.slug,
      mode,
      provider: {
        id: provider.id,
        status: provider.status,
        credentialsRef,
        hasConfig: !!provider.config,
      },
      webhookUrlViaWeb: webhookUrlOut,
      upstream,
    }));
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
