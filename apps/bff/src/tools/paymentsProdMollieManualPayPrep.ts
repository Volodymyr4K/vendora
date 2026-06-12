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

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const tenantSlug = (process.env.TENANT_SLUG ?? "").trim();
  const allowAnyTenant = envBool("PAYMENTS_MOLLIE_ALLOW_ANY_TENANT", false);

  const prisma = new PrismaClient();
  try {
    const tenant =
      tenantSlug
        ? await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true, createdAt: true } })
        : await prisma.tenant.findFirst({
            where: { slug: { startsWith: "zz_mollie_e2e_" } },
            orderBy: { createdAt: "desc" },
            select: { id: true, slug: true, createdAt: true },
          });
    assert(tenant, "Tenant not found (provide TENANT_SLUG or run after paymentsProdMollieE2E)");
    if (!allowAnyTenant) {
      assert(tenant.slug.startsWith("zz_mollie_e2e_"), "Refusing: tenantSlug must start with zz_mollie_e2e_ (set PAYMENTS_MOLLIE_ALLOW_ANY_TENANT=true to override)");
    }

    const provider = await prisma.paymentProvider.findFirst({
      where: { tenantId: tenant.id, type: "MOLLIE", mode: "TEST" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, credentialsRef: true },
    });
    assert(provider, "Mollie TEST provider not found for tenant");

    await prisma.paymentProvider.updateMany({
      where: { tenantId: tenant.id, id: provider.id },
      data: { status: "ACTIVE" },
    });

    const tx = await prisma.paymentTransaction.findFirst({
      where: { tenantId: tenant.id, providerId: provider.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, externalId: true, checkoutUrl: true, createdAt: true },
    });
    assert(tx, "No paymentTransaction found for tenant/provider");
    assert(tx.checkoutUrl, "Transaction has no checkoutUrl (expected PENDING with checkoutUrl)");

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true,
      tool: "paymentsProdMollieManualPayPrep",
      tenant: { id: tenant.id, slug: tenant.slug, createdAt: tenant.createdAt },
      provider: { id: provider.id, statusWas: provider.status, statusNow: "ACTIVE", mode: "TEST", type: "MOLLIE" },
      tx: { id: tx.id, status: tx.status, externalId: tx.externalId, checkoutUrl: tx.checkoutUrl, createdAt: tx.createdAt },
      next: "Open checkoutUrl and complete a TEST payment in Mollie. Then run paymentsProdMollieManualPayVerify.",
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

