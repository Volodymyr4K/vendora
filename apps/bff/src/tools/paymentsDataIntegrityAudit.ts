import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

import { Prisma, PrismaClient } from "@vendora/database";

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

function hasWebhookTokens(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const tokens = (config as any).webhookTokens;
  if (!Array.isArray(tokens)) return false;
  const first = typeof tokens[0] === "string" ? tokens[0].trim() : "";
  return /^[A-Za-z0-9_-]{16,128}$/.test(first);
}

function monobankHasPubkeys(config: unknown): boolean {
  if (!config || typeof config !== "object" || Array.isArray(config)) return false;
  const monobank = (config as any).monobank;
  if (!monobank || typeof monobank !== "object" || Array.isArray(monobank)) return false;
  const keys = (monobank as any).webhookPublicKeysPem;
  return Array.isArray(keys) && keys.some((k: any) => typeof k === "string" && k.includes("BEGIN PUBLIC KEY"));
}

function liqpayConfigSummary(config: unknown): {
  hasPublicKey: boolean;
  currentSecretRef: string | null;
  signatureOutAlgorithm: "sha1" | "sha3-256" | null;
  signatureInAlgorithmsCount: number;
  version: number | null;
} {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { hasPublicKey: false, currentSecretRef: null, signatureOutAlgorithm: null, signatureInAlgorithmsCount: 0, version: null };
  }
  const liqpay = (config as any).liqpay;
  if (!liqpay || typeof liqpay !== "object" || Array.isArray(liqpay)) {
    return { hasPublicKey: false, currentSecretRef: null, signatureOutAlgorithm: null, signatureInAlgorithmsCount: 0, version: null };
  }
  const publicKey = typeof (liqpay as any).publicKey === "string" ? (liqpay as any).publicKey.trim() : "";
  const currentSecretRef = typeof (liqpay as any).currentSecretRef === "string" ? (liqpay as any).currentSecretRef.trim() : "";
  const signatureOutAlgorithmRaw = typeof (liqpay as any).signatureOutAlgorithm === "string" ? (liqpay as any).signatureOutAlgorithm.trim() : "";
  const signatureOutAlgorithm =
    signatureOutAlgorithmRaw === "sha1" || signatureOutAlgorithmRaw === "sha3-256" ? (signatureOutAlgorithmRaw as any) : null;
  const signatureInAlgorithmsRaw = (liqpay as any).signatureInAlgorithms;
  const signatureInAlgorithms = Array.isArray(signatureInAlgorithmsRaw)
    ? signatureInAlgorithmsRaw.filter((a: any) => a === "sha1" || a === "sha3-256")
    : [];
  const versionRaw = (liqpay as any).version;
  const version = Number.isFinite(Number(versionRaw)) ? Number(versionRaw) : null;
  return {
    hasPublicKey: !!publicKey,
    currentSecretRef: currentSecretRef || null,
    signatureOutAlgorithm,
    signatureInAlgorithmsCount: signatureInAlgorithms.length,
    version,
  };
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = envBool("PAYMENTS_AUDIT_ALLOW", false);
  assert(allow, "Refusing to run: set PAYMENTS_AUDIT_ALLOW=true");

  const tenantSlugFilter = normalizeEnvString(process.env.TENANT_SLUG) ?? normalizeEnvString(process.env.PAYMENTS_AUDIT_TENANT_SLUG);
  const take = Math.max(1, Math.min(200, envInt("PAYMENTS_AUDIT_TAKE", 20)));

  const now = new Date();
  const staleInitiatedMinutes = Math.max(1, envInt("PAYMENTS_AUDIT_STALE_INITIATED_MINUTES", 15));
  const staleReceivedMinutes = Math.max(1, envInt("PAYMENTS_AUDIT_STALE_RECEIVED_MINUTES", 2));

  const prisma = new PrismaClient();
  try {
    const tenant = tenantSlugFilter
      ? await prisma.tenant.findUnique({ where: { slug: tenantSlugFilter }, select: { id: true, slug: true } })
      : null;
    if (tenantSlugFilter) assert(tenant, "Tenant not found");

    const tenantWhere = tenant ? { tenantId: tenant.id } : undefined;

    const activeStatuses = ["INITIATED", "PENDING", "PENDING_VERIFICATION"] as const;

    const statusSql = Prisma.join(activeStatuses.map((s) => Prisma.sql`${s}`));
    const multiActiveAttempts = await prisma.$queryRaw<Array<{ tenantId: string; orderDbId: string; count: number }>>(
      Prisma.sql`
        SELECT "tenantId", "orderDbId", COUNT(*)::int AS "count"
        FROM "PaymentTransaction"
        WHERE "status"::text IN (${statusSql})
        ${tenant ? Prisma.sql`AND "tenantId" = ${tenant.id}` : Prisma.empty}
        GROUP BY "tenantId", "orderDbId"
        HAVING COUNT(*) > 1
        ORDER BY COUNT(*) DESC
        LIMIT ${take}
      `
    );

    const staleInitiatedCutoff = new Date(now.getTime() - staleInitiatedMinutes * 60 * 1000);
    const staleInitiated = await prisma.paymentTransaction.findMany({
      where: {
        ...(tenantWhere ?? {}),
        status: "INITIATED",
        externalId: null,
        createdAt: { lt: staleInitiatedCutoff },
      },
      select: { id: true, tenantId: true, orderDbId: true, providerId: true, createdAt: true, resyncAttempt: true, nextResyncAt: true, lastErrorCode: true },
      orderBy: { createdAt: "asc" },
      take,
    });

    const staleReceivedCutoff = new Date(now.getTime() - staleReceivedMinutes * 60 * 1000);
    const staleReceivedEvents = await prisma.paymentEvent.findMany({
      where: { ...(tenantWhere ?? {}), status: "RECEIVED", processedAt: null, receivedAt: { lt: staleReceivedCutoff } },
      select: { id: true, tenantId: true, providerId: true, externalId: true, receivedAt: true, dedupKey: true },
      orderBy: { receivedAt: "asc" },
      take,
    });

    const unmatchedManualAttention = await prisma.paymentEvent.findMany({
      where: { ...(tenantWhere ?? {}), status: "UNMATCHED", unmatchedNextAttemptAt: null },
      select: { id: true, tenantId: true, providerId: true, externalId: true, receivedAt: true, unmatchedAttempt: true, errorCode: true },
      orderBy: { receivedAt: "asc" },
      take,
    });

    const unmatchedAgg = await prisma.paymentEvent
      .aggregate({
        where: { ...(tenantWhere ?? {}), status: "UNMATCHED" },
        _count: { _all: true },
        _min: { receivedAt: true },
      })
      .catch(() => ({ _count: { _all: 0 }, _min: { receivedAt: null as any } }));
    const unmatchedCount = unmatchedAgg._count?._all ?? 0;
    const unmatchedOldestAgeSeconds = unmatchedAgg._min?.receivedAt
      ? Math.max(0, Math.floor((now.getTime() - (unmatchedAgg._min.receivedAt as Date).getTime()) / 1000))
      : 0;

    const activeProviders = await prisma.paymentProvider.findMany({
      where: { ...(tenantWhere ?? {}), status: "ACTIVE" },
      select: { id: true, tenantId: true, type: true, mode: true, status: true, credentialsRef: true, config: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 200,
    });

    const activeProviderConfigIssues = activeProviders
      .map((p) => {
        const issues: string[] = [];
        if (!hasWebhookTokens(p.config)) issues.push("WEBHOOK_TOKENS_MISSING");

        if (p.type === "MOLLIE") {
          if (!p.credentialsRef) issues.push("CREDENTIALS_REF_MISSING");
        } else if (p.type === "MONOBANK") {
          if (!p.credentialsRef) issues.push("CREDENTIALS_REF_MISSING");
          if (!monobankHasPubkeys(p.config)) issues.push("MONOBANK_PUBKEYS_MISSING");
        } else if (p.type === "LIQPAY") {
          const liq = liqpayConfigSummary(p.config);
          if (!liq.hasPublicKey) issues.push("LIQPAY_PUBLIC_KEY_MISSING");
          if (!liq.currentSecretRef) issues.push("LIQPAY_CURRENT_SECRET_REF_MISSING");
          if (!liq.signatureOutAlgorithm) issues.push("LIQPAY_SIGNATURE_OUT_ALGO_INVALID");
          if (liq.signatureInAlgorithmsCount === 0) issues.push("LIQPAY_SIGNATURE_IN_ALGOS_MISSING");
          if (liq.version !== 3) issues.push("LIQPAY_VERSION_INVALID");
        }

        return issues.length ? { providerId: p.id, tenantId: p.tenantId, type: p.type, mode: p.mode, issues } : null;
      })
      .filter(Boolean)
      .slice(0, take);

    const exponentMismatch = await prisma.paymentTransaction.findMany({
      where: { ...(tenantWhere ?? {}), currencyExponent: { not: 2 } },
      select: { id: true, tenantId: true, providerId: true, status: true, currency: true, currencyExponent: true, amountMinor: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take,
    });

    const refundInvariantCandidates = await prisma.paymentTransaction.findMany({
      where: {
        ...(tenantWhere ?? {}),
        OR: [{ refundedAmountMinor: { gt: 0 } }, { refundPendingAmountMinor: { gt: 0 } }],
      },
      select: { id: true, tenantId: true, status: true, amountMinor: true, refundedAmountMinor: true, refundPendingAmountMinor: true },
      orderBy: { createdAt: "desc" },
      take: Math.max(200, take),
    });
    const refundInvariantViolations = refundInvariantCandidates
      .filter((r) => {
        const refunded = r.refundedAmountMinor ?? 0;
        const pending = r.refundPendingAmountMinor ?? 0;
        return refunded > r.amountMinor || pending > r.amountMinor || refunded + pending > r.amountMinor;
      })
      .slice(0, take);

    const paidMismatches = await prisma.paymentTransaction.findMany({
      where: { ...(tenantWhere ?? {}), status: "PAID" },
      select: {
        id: true,
        tenantId: true,
        orderDbId: true,
        providerId: true,
        paidAt: true,
        order: { select: { id: true, status: true, financialStatus: true, paidAt: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const paidOrderMismatchSamples = paidMismatches
      .filter((r) => r.order.financialStatus !== "PAID" || !r.order.paidAt)
      .slice(0, take)
      .map((r) => ({
        transactionId: r.id,
        orderDbId: r.orderDbId,
        orderFinancialStatus: r.order.financialStatus,
        orderPaidAt: r.order.paidAt,
        txPaidAt: r.paidAt,
      }));

    // eslint-disable-next-line no-console
    console.log(
      JSON.stringify({
        ok: true,
        tool: "paymentsDataIntegrityAudit",
        at: now.toISOString(),
        dbHost: safeDbHost(),
        scope: tenant ? { tenantId: tenant.id, tenantSlug: tenant.slug } : { allTenants: true },
        params: {
          take,
          staleInitiatedMinutes,
          staleReceivedMinutes,
        },
        summary: {
          multiActiveAttempts: multiActiveAttempts.length,
          staleInitiated: staleInitiated.length,
          staleReceivedEvents: staleReceivedEvents.length,
          unmatchedCount,
          unmatchedOldestAgeSeconds,
          unmatchedManualAttention: unmatchedManualAttention.length,
          activeProviderConfigIssues: (activeProviderConfigIssues as any[]).length,
          exponentMismatch: exponentMismatch.length,
          refundInvariantViolations: refundInvariantViolations.length,
          paidOrderMismatchSamples: paidOrderMismatchSamples.length,
        },
        samples: {
          multiActiveAttempts,
          staleInitiated,
          staleReceivedEvents,
          unmatchedManualAttention,
          activeProviderConfigIssues,
          exponentMismatch,
          refundInvariantViolations,
          paidOrderMismatchSamples,
        },
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
