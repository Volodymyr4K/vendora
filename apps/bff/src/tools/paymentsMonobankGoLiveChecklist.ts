import { PrismaClient } from "@vendora/database";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { monobankFetchPubkeyPem } from "../services/payments/providers/monobank.js";
import { fetchJsonWithMeta, UpstreamHttpError } from "../services/http.js";

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

function monobankPubkeys(config: unknown): string[] {
  if (!config || typeof config !== "object" || Array.isArray(config)) return [];
  const monobank = (config as any).monobank;
  if (!monobank || typeof monobank !== "object" || Array.isArray(monobank)) return [];
  const keys = (monobank as any).webhookPublicKeysPem;
  if (!Array.isArray(keys)) return [];
  return keys.filter((k: any) => typeof k === "string" && k.trim().length > 0).map((k: string) => k.trim());
}

async function probeMonobankToken(token: string) {
  // Minimal auth probe: fetch pubkey (requires X-Token).
  try {
    const key = await monobankFetchPubkeyPem({ token, timeoutMs: 6_000, retries: 0, backoffMs: 0 });
    return { ok: true as const, code: "OK" as const, hasKey: !!key };
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

async function probeMonobankWebhookPublicKeyMatches(args: { token: string; configuredKeys: string[] }) {
  try {
    const fetched = await monobankFetchPubkeyPem({ token: args.token, timeoutMs: 6_000, retries: 0, backoffMs: 0 });
    const matches = args.configuredKeys.some((k) => k.includes(fetched) || fetched.includes(k));
    return { ok: true as const, matches };
  } catch {
    return { ok: false as const, matches: false };
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
  const requireSecret = envBool("PAYMENTS_GO_LIVE_REQUIRE_SECRET", true);
  const probeUpstream = envBool("PAYMENTS_GO_LIVE_PROBE_UPSTREAM", false);
  const printWebhookUrl = envBool("PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL", false);

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({
      where: { slug: tenantSlug },
      select: { id: true, slug: true },
    });
    if (!tenant) throw new Error("Tenant not found");

    const provider = await prisma.paymentProvider.findUnique({
      where: { tenantId_type_mode: { tenantId: tenant.id, type: "MONOBANK", mode } },
      select: { id: true, tenantId: true, type: true, mode: true, status: true, credentialsRef: true, config: true },
    });
    if (!provider) throw new Error("Monobank provider not found for tenant/mode");

    if (requireActive && provider.status !== "ACTIVE") throw new Error("Monobank provider is not ACTIVE");

    const token = firstWebhookToken(provider.config);
    assert(token, "Provider webhookTokens missing/invalid");

    const pubkeys = monobankPubkeys(provider.config);
    assert(pubkeys.length > 0, "Provider monobank.webhookPublicKeysPem missing/empty");

    const credentialsRef = (provider.credentialsRef ?? "").trim();
    if (requireSecret) assert(credentialsRef, "Provider credentialsRef missing");

    const providerToken = credentialsRef ? (process.env[credentialsRef] ?? "").trim() : "";
    if (requireSecret) assert(providerToken, "Provider token missing in environment (credentialsRef points to unset env var)");

    const webhookUrlViaWeb = `${webBase}/api/webhooks/payments/monobank/${provider.id}?t=${encodeURIComponent(token)}`;
    const webhookUrlOut = printWebhookUrl ? webhookUrlViaWeb : redactWebhookUrl(webhookUrlViaWeb);

    const upstream =
      probeUpstream && providerToken
        ? await probeMonobankToken(providerToken)
        : { ok: true as const, skipped: true as const };

    const keyMatch =
      probeUpstream && providerToken
        ? await probeMonobankWebhookPublicKeyMatches({ token: providerToken, configuredKeys: pubkeys })
        : { ok: true as const, skipped: true as const };

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        tool: "paymentsMonobankGoLiveChecklist",
        tenantId: tenant.id,
        tenantSlug: tenant.slug,
        mode,
        provider: {
          id: provider.id,
          status: provider.status,
          credentialsRef: credentialsRef || null,
          pubkeysConfigured: pubkeys.length,
          hasConfig: !!provider.config,
        },
        webhookUrlViaWeb: webhookUrlOut,
        upstream,
        keyMatch,
        notes: [
          "Monobank has no sandbox in our integration; PAYMENTS_MODE is an internal grouping only.",
          "Webhook signature verification requires monobank.webhookPublicKeysPem (raw-body + X-Sign).",
        ],
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

