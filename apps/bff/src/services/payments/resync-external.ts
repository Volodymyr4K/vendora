import type { PrismaClient } from "@vendora/database";
import type { SecretResolver } from "../secrets.js";
import { UpstreamHttpError } from "../http.js";
import { logger } from "../../lib/logger.js";
import { paymentsEventStatusTransitionsTotal, paymentsUnmatchedAttemptsTotal, paymentsUnmatchedGiveUpTotal } from "../../lib/metrics.js";
import { monobankFetchInvoiceStatus } from "./providers/monobank.js";
import { mollieFetchPayment } from "./providers/mollie.js";
import { PaymentTransactionStatus, applyMonotonicTransition } from "./payment-transaction-status.js";
import { computeNextResyncAt } from "./resync-transaction.js";
import { resyncPaymentTransaction } from "./resync-transaction.js";

export type ResyncExternalErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_NOT_ACTIVE"
  | "PROVIDER_SECRET_MISSING"
  | "PROVIDER_UNSUPPORTED"
  | "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RESPONSE_UNPARSABLE"
  | "VERIFY_PERMANENT_LINKAGE_MISMATCH"
  | "PROVIDER_BAD_REQUEST"
  | "UNMATCHED_GIVE_UP"
  | "PROCESSING_UNEXPECTED_ERROR";

export type ResyncExternalResult =
  | { ok: true; code: "OK" | "NOOP"; didLink: boolean; didResync: boolean }
  | { ok: false; code: ResyncExternalErrorCode };

function isUuidLike(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function classifyUpstreamError(err: unknown): {
  kind: "TRANSIENT" | "AUTH" | "NOT_FOUND" | "BAD_REQUEST" | "UNPARSABLE" | "UNKNOWN";
} {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("unexpected response shape") || msg.includes("unparsable") || msg.includes("invalid decimal amount")) {
      return { kind: "UNPARSABLE" };
    }
  }
  if (!(err instanceof UpstreamHttpError)) return { kind: "UNKNOWN" };
  const status = err.status;
  if (err.isTimeout || status === null) return { kind: "TRANSIENT" };
  if (status === 429 || status >= 500) return { kind: "TRANSIENT" };
  if (status === 401 || status === 403) return { kind: "AUTH" };
  if (status === 404) return { kind: "NOT_FOUND" };
  if (err.message.toLowerCase().includes("json parse")) return { kind: "UNPARSABLE" };
  if (status >= 400 && status < 500) return { kind: "BAD_REQUEST" };
  return { kind: "UNKNOWN" };
}

function stopByGiveUp(args: { attempt: number; receivedAt: Date; now: Date }) {
  if (args.attempt >= 20) return true;
  if (args.receivedAt.getTime() < args.now.getTime() - 24 * 60 * 60 * 1000) return true;
  return false;
}

async function bumpUnmatched(args: {
  prisma: PrismaClient;
  tenantId: string;
  providerId: string;
  providerType: string;
  externalId: string;
  now: Date;
  code: ResyncExternalErrorCode;
  transient: boolean;
}) {
  const ev = await args.prisma.paymentEvent.findFirst({
    where: { tenantId: args.tenantId, providerId: args.providerId, externalId: args.externalId, status: "UNMATCHED" },
    orderBy: { receivedAt: "desc" },
    select: { id: true, unmatchedAttempt: true, receivedAt: true },
  });
  if (!ev) return;

  const nextAttempt = ev.unmatchedAttempt + 1;
  paymentsUnmatchedAttemptsTotal.inc({
    provider_type: args.providerType,
    code: args.code,
    transient: args.transient ? "true" : "false",
  });
  const giveUp = stopByGiveUp({ attempt: nextAttempt, receivedAt: ev.receivedAt, now: args.now });
  if (giveUp) {
    paymentsUnmatchedGiveUpTotal.inc({ provider_type: args.providerType });
    paymentsEventStatusTransitionsTotal.inc({ status_from: "UNMATCHED", status_to: "FAILED" });
    logger.warn(
      { providerType: args.providerType, tenantId: args.tenantId, providerId: args.providerId, externalId: args.externalId, nextAttempt },
      "[Payments] UNMATCHED give-up (manual intervention required)"
    );
    await args.prisma.paymentEvent.update({
      where: { id: ev.id },
      data: { status: "FAILED", errorCode: "UNMATCHED_GIVE_UP", processedAt: args.now, unmatchedNextAttemptAt: null },
    });
    return;
  }

  await args.prisma.paymentEvent.update({
    where: { id: ev.id },
    data: {
      errorCode: args.code,
      unmatchedAttempt: nextAttempt,
      unmatchedNextAttemptAt: args.transient ? computeNextResyncAt({ now: args.now, nextAttempt, capMinutes: 30 }) : null,
    },
  });
}

async function markUnmatchedEventsProcessed(args: {
  prisma: PrismaClient;
  tenantId: string;
  providerId: string;
  externalId: string;
  transactionId: string;
  now: Date;
}) {
  const res = await args.prisma.paymentEvent.updateMany({
    where: { tenantId: args.tenantId, providerId: args.providerId, externalId: args.externalId, status: "UNMATCHED" },
    data: { status: "PROCESSED", transactionId: args.transactionId, processedAt: args.now },
  });
  if (res.count > 0) {
    paymentsEventStatusTransitionsTotal.inc({ status_from: "UNMATCHED", status_to: "PROCESSED" }, res.count);
  }
}

export async function resyncExternalPayment(args: {
  prisma: PrismaClient;
  secrets: SecretResolver;
  tenantId: string;
  providerId: string;
  externalId: string;
  now?: Date | undefined;
}): Promise<ResyncExternalResult> {
  const now = args.now ?? new Date();

  const provider = await args.prisma.paymentProvider.findUnique({
    where: { id: args.providerId },
    select: { id: true, tenantId: true, type: true, status: true, credentialsRef: true },
  });
  if (!provider || provider.tenantId !== args.tenantId) return { ok: false, code: "PROVIDER_NOT_FOUND" };
  if (provider.status !== "ACTIVE") return { ok: false, code: "PROVIDER_NOT_ACTIVE" };

  const directTx = await args.prisma.paymentTransaction.findFirst({
    where: { tenantId: args.tenantId, providerId: provider.id, externalId: args.externalId },
    select: { id: true },
  });
  if (directTx) {
    const res = await resyncPaymentTransaction({
      prisma: args.prisma,
      secrets: args.secrets,
      tenantId: args.tenantId,
      transactionId: directTx.id,
      now,
    });
    if (res.ok) {
      await markUnmatchedEventsProcessed({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        externalId: args.externalId,
        transactionId: directTx.id,
        now,
      });
      return { ok: true, code: res.didUpdate ? "OK" : "NOOP", didLink: false, didResync: true };
    }

    if (res.code === "TX_TERMINAL_NOOP") {
      await markUnmatchedEventsProcessed({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        externalId: args.externalId,
        transactionId: directTx.id,
        now,
      });
      return { ok: true, code: "NOOP", didLink: false, didResync: false };
    }

    const code =
      res.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
      res.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
      res.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
      res.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
      res.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
      res.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
      "PROCESSING_UNEXPECTED_ERROR";

    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code,
      transient: res.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" || res.code === "PROVIDER_RESPONSE_UNPARSABLE",
    });
    return { ok: false, code };
  }

  if (provider.type === "LIQPAY") {
    // LiqPay `externalId` is `order_id` which equals our `transactionId` (UUID).
    if (!isUuidLike(args.externalId)) {
      await bumpUnmatched({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        providerType: provider.type,
        externalId: args.externalId,
        now,
        code: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
        transient: true,
      });
      return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
    }

    const tx = await args.prisma.paymentTransaction.findUnique({
      where: { tenantId_id: { tenantId: args.tenantId, id: args.externalId } },
      select: { id: true, providerId: true, externalId: true, status: true },
    });
    if (!tx || tx.providerId !== provider.id) {
      await bumpUnmatched({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        providerType: provider.type,
        externalId: args.externalId,
        now,
        code: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
        transient: true,
      });
      return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
    }

    const didLink =
      tx.externalId == null &&
      (await args.prisma.paymentTransaction.updateMany({
        where: {
          tenantId: args.tenantId,
          id: tx.id,
          providerId: provider.id,
          externalId: null,
          status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
        },
        data: {
          externalId: args.externalId,
          status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING }),
          nextResyncAt: new Date(now.getTime() + 5 * 60 * 1000),
          resyncAttempt: 0,
        },
      })).count === 1;

    const resync = await resyncPaymentTransaction({
      prisma: args.prisma,
      secrets: args.secrets,
      tenantId: args.tenantId,
      transactionId: tx.id,
      now,
    });

    if (resync.ok) {
      await markUnmatchedEventsProcessed({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        externalId: args.externalId,
        transactionId: tx.id,
        now,
      });
      return { ok: true, code: resync.didUpdate ? "OK" : "NOOP", didLink, didResync: true };
    }

    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code:
        resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
        resync.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
        resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
        resync.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
        resync.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
        resync.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
        "PROCESSING_UNEXPECTED_ERROR",
      transient: resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" || resync.code === "PROVIDER_RESPONSE_UNPARSABLE",
    });
    const code =
      resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
      resync.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
      resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
      resync.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
      resync.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
      resync.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
      "PROCESSING_UNEXPECTED_ERROR";
    return { ok: false, code };
  }

  if (provider.type === "MOLLIE") {
    const apiKeyRef = provider.credentialsRef;
    const apiKey = apiKeyRef ? args.secrets.resolve(apiKeyRef) : undefined;
    if (!apiKey) {
      await bumpUnmatched({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        providerType: provider.type,
        externalId: args.externalId,
        now,
        code: "PROVIDER_SECRET_MISSING",
        transient: false,
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    let payment: any;
    try {
      payment = await mollieFetchPayment({ apiKey, paymentId: args.externalId, timeoutMs: 4500, retries: 1, backoffMs: 250 });
    } catch (e: unknown) {
      const c = classifyUpstreamError(e);
      const map: Record<string, ResyncExternalErrorCode> = {
        TRANSIENT: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
        AUTH: "PROVIDER_AUTH_FAILED",
        NOT_FOUND: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
        BAD_REQUEST: "PROVIDER_BAD_REQUEST",
        UNPARSABLE: "PROVIDER_RESPONSE_UNPARSABLE",
        UNKNOWN: "PROCESSING_UNEXPECTED_ERROR",
      };
      const code = map[c.kind] ?? "PROCESSING_UNEXPECTED_ERROR";
      await bumpUnmatched({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        providerType: provider.type,
        externalId: args.externalId,
        now,
        code,
        transient: c.kind === "TRANSIENT" || c.kind === "UNPARSABLE" || c.kind === "NOT_FOUND",
      });
      return { ok: false, code };
    }

    const candidate = typeof payment?.metadata?.transactionId === "string" ? payment.metadata.transactionId : undefined;
    if (!candidate || !isUuidLike(candidate)) {
      await bumpUnmatched({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        providerType: provider.type,
        externalId: args.externalId,
        now,
        code: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
        transient: true,
      });
      return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
    }

    const linkTx = await args.prisma.paymentTransaction.findUnique({
      where: { tenantId_id: { tenantId: args.tenantId, id: candidate } },
      select: { id: true, providerId: true, externalId: true, status: true },
    });
    if (!linkTx || linkTx.providerId !== provider.id) {
      await bumpUnmatched({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        providerType: provider.type,
        externalId: args.externalId,
        now,
        code: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
        transient: true,
      });
      return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
    }

    const didLink =
      linkTx.externalId == null &&
      (await args.prisma.paymentTransaction.updateMany({
        where: {
          tenantId: args.tenantId,
          id: linkTx.id,
          providerId: provider.id,
          externalId: null,
          status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
        },
        data: {
          externalId: args.externalId,
          status: applyMonotonicTransition({ current: linkTx.status, observed: PaymentTransactionStatus.PENDING }),
          nextResyncAt: new Date(now.getTime() + 5 * 60 * 1000),
          resyncAttempt: 0,
        },
      })).count === 1;

    const resync = await resyncPaymentTransaction({
      prisma: args.prisma,
      secrets: args.secrets,
      tenantId: args.tenantId,
      transactionId: linkTx.id,
      now,
    });

    if (resync.ok) {
      await markUnmatchedEventsProcessed({
        prisma: args.prisma,
        tenantId: args.tenantId,
        providerId: provider.id,
        externalId: args.externalId,
        transactionId: linkTx.id,
        now,
      });
      return { ok: true, code: resync.didUpdate ? "OK" : "NOOP", didLink, didResync: true };
    }

    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code:
        resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
        resync.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
        resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
        resync.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
        resync.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
        resync.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
        "PROCESSING_UNEXPECTED_ERROR",
      transient: resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" || resync.code === "PROVIDER_RESPONSE_UNPARSABLE",
    });
    const code =
      resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
      resync.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
      resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
      resync.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
      resync.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
      resync.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
      "PROCESSING_UNEXPECTED_ERROR";
    return { ok: false, code };
  }

  if (provider.type !== "MONOBANK") return { ok: false, code: "PROVIDER_UNSUPPORTED" };

  const tokenRef = provider.credentialsRef;
  const token = tokenRef ? args.secrets.resolve(tokenRef) : undefined;
  if (!token) {
    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code: "PROVIDER_SECRET_MISSING",
      transient: false,
    });
    return { ok: false, code: "PROVIDER_SECRET_MISSING" };
  }

  let invoice: any;
  try {
    invoice = await monobankFetchInvoiceStatus({ token, invoiceId: args.externalId, timeoutMs: 4500, retries: 1, backoffMs: 250 });
  } catch (e: unknown) {
    const c = classifyUpstreamError(e);
    const map: Record<string, ResyncExternalErrorCode> = {
      TRANSIENT: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
      AUTH: "PROVIDER_AUTH_FAILED",
      NOT_FOUND: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
      BAD_REQUEST: "PROVIDER_BAD_REQUEST",
      UNPARSABLE: "PROVIDER_RESPONSE_UNPARSABLE",
      UNKNOWN: "PROCESSING_UNEXPECTED_ERROR",
    };
    const code = map[c.kind] ?? "PROCESSING_UNEXPECTED_ERROR";
    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code,
      transient: c.kind === "TRANSIENT" || c.kind === "UNPARSABLE" || c.kind === "NOT_FOUND",
    });
    return { ok: false, code };
  }

  const candidate = typeof invoice?.reference === "string" ? invoice.reference : undefined;
  if (!candidate || !isUuidLike(candidate)) {
    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
      transient: true,
    });
    return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
  }

  const linkTx = await args.prisma.paymentTransaction.findUnique({
    where: { tenantId_id: { tenantId: args.tenantId, id: candidate } },
    select: { id: true, providerId: true, externalId: true, status: true },
  });
  if (!linkTx || linkTx.providerId !== provider.id) {
    await bumpUnmatched({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      providerType: provider.type,
      externalId: args.externalId,
      now,
      code: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
      transient: true,
    });
    return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
  }

  const didLink =
    linkTx.externalId == null &&
    (await args.prisma.paymentTransaction.updateMany({
      where: {
        tenantId: args.tenantId,
        id: linkTx.id,
        providerId: provider.id,
        externalId: null,
        status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
      },
      data: {
        externalId: args.externalId,
        status: applyMonotonicTransition({ current: linkTx.status, observed: PaymentTransactionStatus.PENDING }),
        nextResyncAt: new Date(now.getTime() + 5 * 60 * 1000),
        resyncAttempt: 0,
      },
    })).count === 1;

  const resync = await resyncPaymentTransaction({
    prisma: args.prisma,
    secrets: args.secrets,
    tenantId: args.tenantId,
    transactionId: linkTx.id,
    now,
  });

  if (resync.ok) {
    await markUnmatchedEventsProcessed({
      prisma: args.prisma,
      tenantId: args.tenantId,
      providerId: provider.id,
      externalId: args.externalId,
      transactionId: linkTx.id,
      now,
    });
    return { ok: true, code: resync.didUpdate ? "OK" : "NOOP", didLink, didResync: true };
  }

  await bumpUnmatched({
    prisma: args.prisma,
    tenantId: args.tenantId,
    providerId: provider.id,
    providerType: provider.type,
    externalId: args.externalId,
    now,
    code:
      resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
      resync.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
      resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
      resync.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
      resync.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
      resync.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
      "PROCESSING_UNEXPECTED_ERROR",
    transient: resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" || resync.code === "PROVIDER_RESPONSE_UNPARSABLE",
  });
  const code =
    resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ? "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" :
    resync.code === "PROVIDER_AUTH_FAILED" ? "PROVIDER_AUTH_FAILED" :
    resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ? "PROVIDER_RESPONSE_UNPARSABLE" :
    resync.code === "VERIFY_PERMANENT_LINKAGE_MISMATCH" ? "VERIFY_PERMANENT_LINKAGE_MISMATCH" :
    resync.code === "PROVIDER_BAD_REQUEST" ? "PROVIDER_BAD_REQUEST" :
    resync.code === "PROVIDER_SECRET_MISSING" ? "PROVIDER_SECRET_MISSING" :
    "PROCESSING_UNEXPECTED_ERROR";
  return { ok: false, code };
}
