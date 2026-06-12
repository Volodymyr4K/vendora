import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { PrismaClient, Prisma } from "@vendora/database";

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

function envInt(name: string, defaultValue: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
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

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = envBool("PAYMENTS_DRILL_ALLOW", false);
  assert(allow, "Refusing to run: set PAYMENTS_DRILL_ALLOW=true");

  const dbHost = safeDbHost();
  const allowNonLocalDb = envBool("PAYMENTS_DRILL_ALLOW_NONLOCAL_DB", false);
  const isLocalDb = dbHost === "localhost" || dbHost === "127.0.0.1";
  assert(isLocalDb || allowNonLocalDb, `Refusing to run on non-local DATABASE_URL host (${dbHost ?? "unknown"}). Set PAYMENTS_DRILL_ALLOW_NONLOCAL_DB=true if intended.`);

  const protectedTenantSlug = (process.env.PAYMENTS_PROTECTED_TENANT_SLUG ?? "berlin-press").trim();
  assert(protectedTenantSlug, "PAYMENTS_PROTECTED_TENANT_SLUG empty");

  const zzPrefix = (process.env.PAYMENTS_TEST_TENANT_PREFIX ?? "zz-").trim();
  assert(zzPrefix, "PAYMENTS_TEST_TENANT_PREFIX empty");

  const take = Math.max(1, Math.min(200, envInt("PAYMENTS_DRILL_TAKE", 20)));
  const staleInitiatedMinutes = Math.max(1, envInt("PAYMENTS_DRILL_STALE_INITIATED_MINUTES", 15));
  const staleReceivedMinutes = Math.max(1, envInt("PAYMENTS_DRILL_STALE_RECEIVED_MINUTES", 2));

  const prisma = new PrismaClient();
  try {
    const protectedTenant = await prisma.tenant.findUnique({ where: { slug: protectedTenantSlug }, select: { id: true, slug: true } });
    assert(protectedTenant, `Protected tenant not found: ${protectedTenantSlug}`);

    const protectedActiveProvidersCount = await prisma.paymentProvider.count({
      where: { tenantId: protectedTenant.id, status: "ACTIVE" },
    });

    const zzTenantsCount = await prisma.tenant.count({ where: { slug: { startsWith: zzPrefix } } });
    const zzActiveProvidersCount = await prisma.paymentProvider.count({
      where: { tenant: { slug: { startsWith: zzPrefix } }, status: "ACTIVE" },
    });

    const now = new Date();
    const staleInitiatedCutoff = new Date(now.getTime() - staleInitiatedMinutes * 60 * 1000);
    const staleInitiatedCount = await prisma.paymentTransaction.count({
      where: { status: "INITIATED", externalId: null, createdAt: { lt: staleInitiatedCutoff } },
    });

    const staleReceivedCutoff = new Date(now.getTime() - staleReceivedMinutes * 60 * 1000);
    const staleReceivedCount = await prisma.paymentEvent.count({
      where: { status: "RECEIVED", processedAt: null, receivedAt: { lt: staleReceivedCutoff } },
    });

    const unmatchedAgg = await prisma.paymentEvent
      .aggregate({
        where: { status: "UNMATCHED" },
        _count: { _all: true },
        _min: { receivedAt: true },
      })
      .catch(() => ({ _count: { _all: 0 }, _min: { receivedAt: null as any } }));
    const unmatchedCount = unmatchedAgg._count?._all ?? 0;
    const unmatchedOldestAgeSeconds = unmatchedAgg._min?.receivedAt
      ? Math.max(0, Math.floor((now.getTime() - (unmatchedAgg._min.receivedAt as Date).getTime()) / 1000))
      : 0;

    const unmatchedManualAttentionCount = await prisma.paymentEvent.count({
      where: { status: "UNMATCHED", unmatchedNextAttemptAt: null },
    });

    const activeStatuses = ["INITIATED", "PENDING", "PENDING_VERIFICATION"] as const;
    const statusSql = Prisma.join(activeStatuses.map((s) => Prisma.sql`${s}`));
    const multiActiveAttempts = await prisma.$queryRaw<Array<{ tenantId: string; orderDbId: string; count: number }>>(
      Prisma.sql`
        SELECT "tenantId", "orderDbId", COUNT(*)::int AS "count"
        FROM "PaymentTransaction"
        WHERE "status"::text IN (${statusSql})
        GROUP BY "tenantId", "orderDbId"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT ${take}
      `
    );

    const pass =
      protectedActiveProvidersCount === 0 &&
      zzActiveProvidersCount === 0 &&
      multiActiveAttempts.length === 0 &&
      staleInitiatedCount === 0 &&
      staleReceivedCount === 0 &&
      unmatchedManualAttentionCount === 0;

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify(
        {
          ok: true,
          tool: "paymentsIncidentDrillRunner",
          pass,
          db: { host: dbHost, local: isLocalDb },
          protectedTenant: { slug: protectedTenantSlug, activeProvidersCount: protectedActiveProvidersCount },
          zz: { prefix: zzPrefix, tenantsCount: zzTenantsCount, activeProvidersCount: zzActiveProvidersCount },
          integrity: {
            multiActiveAttempts: multiActiveAttempts.length,
            staleInitiatedCount,
            staleReceivedCount,
            unmatchedCount,
            unmatchedOldestAgeSeconds,
            unmatchedManualAttentionCount,
          },
          note: "This tool is read-only and does not print secret values.",
        },
        null,
        2
      )
    );

    if (!pass) process.exitCode = 2;
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

