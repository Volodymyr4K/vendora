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

function randomWebhookToken(len = 48) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

function redactWebhookUrl(url: string): string {
  return url.replace(/([?&]t=)[^&]+/, "$1<redacted>");
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = envBool("PAYMENTS_GO_LIVE_ALLOW", false);
  assert(allow, "Refusing to run: set PAYMENTS_GO_LIVE_ALLOW=true");

  const tenantSlug = (process.env.TENANT_SLUG ?? "zz-liqpay-lab").trim();
  assert(tenantSlug, "TENANT_SLUG empty");
  assert(tenantSlug !== "berlin-press", "Refusing: do not modify tenant berlin-press");
  assert(tenantSlug.startsWith("zz-"), "Refusing: tenantSlug must start with zz-");

  const mode = ((process.env.PAYMENTS_MODE ?? "TEST").trim().toUpperCase() === "LIVE" ? "LIVE" : "TEST") as "TEST" | "LIVE";

  const publicKey = (process.env.LIQPAY_PUBLIC_KEY ?? "liqpay_public_key_placeholder").trim();
  const currentSecretRef = (process.env.LIQPAY_CURRENT_SECRET_REF ?? "ZZ_LIQPAY_PRIVATE_KEY").trim();
  const signatureOutAlgorithm = (process.env.LIQPAY_SIGNATURE_OUT_ALGORITHM ?? "sha1").trim();
  const signatureInAlgorithmsRaw = (process.env.LIQPAY_SIGNATURE_IN_ALGORITHMS ?? "sha1").trim();
  const signatureInAlgorithms = signatureInAlgorithmsRaw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s === "sha1" || s === "sha3-256");
  const version = 3;

  assert(publicKey, "LIQPAY_PUBLIC_KEY empty");
  assert(currentSecretRef, "LIQPAY_CURRENT_SECRET_REF empty");
  assert(signatureOutAlgorithm === "sha1" || signatureOutAlgorithm === "sha3-256", "LIQPAY_SIGNATURE_OUT_ALGORITHM invalid");
  assert(signatureInAlgorithms.length > 0, "LIQPAY_SIGNATURE_IN_ALGORITHMS invalid/empty");

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

    const branchSlug = `zz-liqpay-${Date.now()}`;
    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, slug: branchSlug, cityName: "LiqPay Lab", phones: [], zones: [] },
      select: { id: true, slug: true },
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { branchesMode: "SINGLE", defaultBranchId: branch.id },
    });

    const webhookToken = randomWebhookToken(48);

    const providerExisting = await prisma.paymentProvider.findUnique({
      where: { tenantId_type_mode: { tenantId: tenant.id, type: "LIQPAY", mode } },
      select: { id: true },
    });

    const config = {
      webhookTokens: [webhookToken],
      liqpay: {
        publicKey,
        currentSecretRef,
        signatureOutAlgorithm,
        signatureInAlgorithms,
        version,
      },
    };

    const provider = providerExisting
      ? await prisma.paymentProvider.update({
          where: { id: providerExisting.id },
          data: { status: "DISABLED", credentialsRef: null, config },
          select: { id: true, status: true, mode: true, type: true, config: true },
        })
      : await prisma.paymentProvider.create({
          data: { tenantId: tenant.id, type: "LIQPAY", mode, status: "DISABLED", credentialsRef: null, config },
          select: { id: true, status: true, mode: true, type: true, config: true },
        });
    createdProvider = !providerExisting;

    const webhookUrlViaWeb = webBase
      ? redactWebhookUrl(`${webBase}/api/webhooks/payments/liqpay/${provider.id}?t=${encodeURIComponent(webhookToken)}`)
      : null;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        tool: "paymentsLiqpayLabSetup",
        created: { tenant: createdTenant, provider: createdProvider },
        tenant: { id: tenant.id, slug: tenant.slug },
        branch: { id: branch.id, slug: branch.slug },
        provider: { id: provider.id, type: provider.type, mode: provider.mode, status: provider.status },
        liqpay: {
          publicKey: publicKey ? "<present>" : "<missing>",
          currentSecretRef,
          signatureOutAlgorithm,
          signatureInAlgorithms,
          version,
        },
        webhookUrlViaWeb,
        next: [
          `Set secret ${currentSecretRef} (private key) in runtime env when available.`,
          "Optionally set previousSecretRef+previousValidUntil during secret rotation.",
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

