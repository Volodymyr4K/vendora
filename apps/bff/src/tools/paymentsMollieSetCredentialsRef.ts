import { PrismaClient } from "@vendora/database";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const allow = (process.env.PAYMENTS_GO_LIVE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_GO_LIVE_ALLOW=true");

  const tenantSlug = (process.env.TENANT_SLUG ?? "").trim();
  assert(tenantSlug, "TENANT_SLUG missing");

  const mode = ((process.env.PAYMENTS_MODE ?? "TEST").trim().toUpperCase() === "LIVE" ? "LIVE" : "TEST") as "TEST" | "LIVE";
  const credentialsRef = (process.env.CREDENTIALS_REF ?? "ZZ_MOLLIE_API_KEY_TEST").trim();
  assert(credentialsRef, "CREDENTIALS_REF missing/empty");

  assert(tenantSlug !== "berlin-press", "Refusing: do not modify tenant berlin-press");

  const prisma = new PrismaClient();
  try {
    const tenant = await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } });
    assert(tenant, "Tenant not found");

    const provider = await prisma.paymentProvider.findUnique({
      where: { tenantId_type_mode: { tenantId: tenant.id, type: "MOLLIE", mode } },
      select: { id: true, credentialsRef: true, status: true, mode: true, type: true },
    });
    assert(provider, "Mollie provider not found for tenant/mode");

    const updated = await prisma.paymentProvider.update({
      where: { id: provider.id },
      data: { credentialsRef },
      select: { id: true, credentialsRef: true, status: true, mode: true, type: true },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true,
      tool: "paymentsMollieSetCredentialsRef",
      tenantSlug: tenant.slug,
      provider: updated,
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

