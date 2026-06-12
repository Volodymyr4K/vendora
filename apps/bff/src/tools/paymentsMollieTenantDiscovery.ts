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

async function main() {
  const allow = (process.env.PAYMENTS_GO_LIVE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_GO_LIVE_ALLOW=true");

  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const excludeSlug = (process.env.PAYMENTS_GO_LIVE_EXCLUDE_TENANT_SLUG ?? "berlin-press").trim();

  const mode = ((process.env.PAYMENTS_MODE ?? "LIVE").trim().toUpperCase() === "TEST" ? "TEST" : "LIVE") as "TEST" | "LIVE";

  const prisma = new PrismaClient();
  try {
    const providers = await prisma.paymentProvider.findMany({
      where: { type: "MOLLIE", mode },
      select: { id: true, status: true, credentialsRef: true, config: true, tenantId: true },
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
        const credentialsRef = (p.credentialsRef ?? "").trim();
        return {
          tenantSlug,
          providerId: p.id,
          mode,
          status: p.status,
          hasWebhookToken: firstWebhookTokenPresent(p.config),
          hasCredentialsRef: !!credentialsRef,
          credentialsEnvPresent: !!(credentialsRef && (process.env[credentialsRef] ?? "").trim()),
        };
      })
      .filter((r) => !!r.tenantSlug && r.tenantSlug !== excludeSlug);

    const candidates = rows
      .filter((r) => r.status === "ACTIVE" && r.hasWebhookToken && r.hasCredentialsRef && r.credentialsEnvPresent)
      .slice(0, 20);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true,
      tool: "paymentsMollieTenantDiscovery",
      mode,
      excludeSlug,
      candidates,
      summary: {
        scannedProviders: providers.length,
        tenantsResolved: tenants.length,
        totalUsable: candidates.length,
      },
      all: rows.slice(0, 50),
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
