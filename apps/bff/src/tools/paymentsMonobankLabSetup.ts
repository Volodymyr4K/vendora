import crypto from "node:crypto";
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

function normalizeBaseUrl(raw: string | undefined | null) {
  return (raw ?? "").trim().replace(/\/$/, "");
}

function randomToken(len = 48) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function redactWebhookUrl(url: string): string {
  return url.replace(/([?&]t=)[^&]+/, "$1<redacted>");
}

function generatePlaceholderEcdsaPublicKeyPem(): string {
  const { publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "prime256v1" });
  return publicKey.export({ type: "spki", format: "pem" }).toString();
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = envBool("PAYMENTS_GO_LIVE_ALLOW", false);
  assert(allow, "Refusing to run: set PAYMENTS_GO_LIVE_ALLOW=true");

  const tenantSlug = (process.env.TENANT_SLUG ?? "zz-monobank-lab").trim();
  assert(tenantSlug, "TENANT_SLUG empty");
  assert(tenantSlug !== "berlin-press", "Refusing: do not modify tenant berlin-press");
  assert(tenantSlug.startsWith("zz-"), "Refusing: tenantSlug must start with zz-");

  const mode = ((process.env.PAYMENTS_MODE ?? "TEST").trim().toUpperCase() === "LIVE" ? "LIVE" : "TEST") as "TEST" | "LIVE";
  const credentialsRef = (process.env.CREDENTIALS_REF ?? "ZZ_MONOBANK_X_TOKEN").trim();
  assert(credentialsRef, "CREDENTIALS_REF empty");

  const webBase = normalizeBaseUrl(process.env.WEB_BASE_URL);

  const prisma = new PrismaClient();
  let createdTenant = false;
  let createdProvider = false;

  try {
    const tenantExisting = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true } });
    const tenant = tenantExisting
      ? await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } })
      : await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug }, select: { id: true, slug: true } });
    assert(tenant, "Failed to create/find tenant");
    createdTenant = !tenantExisting;

    const branchSlug = `zz-monobank-${Date.now()}`;
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, slug: branchSlug, cityName: "Monobank Lab", phones: [], zones: [] },
      select: { id: true, slug: true },
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { branchesMode: "SINGLE", defaultBranchId: branch.id },
    });

    const webhookToken = randomToken(48);
    const placeholderKeyPem = generatePlaceholderEcdsaPublicKeyPem();

    const providerExisting = await prisma.paymentProvider.findUnique({
      where: { tenantId_type_mode: { tenantId: tenant.id, type: "MONOBANK", mode } },
      select: { id: true },
    });

    const provider = providerExisting
      ? await prisma.paymentProvider.update({
          where: { id: providerExisting.id },
          data: {
            status: "DISABLED",
            credentialsRef,
            config: {
              webhookTokens: [webhookToken],
              monobank: { webhookPublicKeysPem: [placeholderKeyPem] },
            },
          },
          select: { id: true, status: true, mode: true, type: true, credentialsRef: true, config: true },
        })
      : await prisma.paymentProvider.create({
          data: {
            tenantId: tenant.id,
            type: "MONOBANK",
            mode,
            status: "DISABLED",
            credentialsRef,
            config: {
              webhookTokens: [webhookToken],
              monobank: { webhookPublicKeysPem: [placeholderKeyPem] },
            },
          },
          select: { id: true, status: true, mode: true, type: true, credentialsRef: true, config: true },
        });
    createdProvider = !providerExisting;

    const webhookUrlViaWeb = webBase
      ? redactWebhookUrl(`${webBase}/api/webhooks/payments/monobank/${provider.id}?t=${encodeURIComponent(webhookToken)}`)
      : null;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        tool: "paymentsMonobankLabSetup",
        created: { tenant: createdTenant, provider: createdProvider },
        tenant: { id: tenant.id, slug: tenant.slug },
        branch: { id: branch.id, slug: branch.slug },
        provider: {
          id: provider.id,
          type: provider.type,
          mode: provider.mode,
          status: provider.status,
          credentialsRef: provider.credentialsRef,
          hasWebhookToken: true,
          pubkeysConfigured: 1,
          pubkeyIsPlaceholder: true,
        },
        webhookUrlViaWeb,
        next: [
          `Set secret ${credentialsRef} in runtime env (Fly secret) when available.`,
          "Replace placeholder monobank.webhookPublicKeysPem with the fetched pubkey (GET /api/merchant/pubkey).",
          "Then set provider status=ACTIVE.",
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

