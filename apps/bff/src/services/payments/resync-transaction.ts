import type { PrismaClient } from "@vendora/database";
import { moneyFromMinor } from "../../utils/money.js";
import type { SecretResolver } from "../secrets.js";
import { UpstreamHttpError } from "../http.js";
import { PaymentTransactionStatus, applyMonotonicTransition, isPostPaidStatus, isTerminalStatus } from "./payment-transaction-status.js";
import { monobankFetchInvoiceStatus } from "./providers/monobank.js";
import { liqpayFetchStatus, type LiqpaySignatureAlgorithm } from "./providers/liqpay.js";
import { mollieFetchChargebacks, mollieFetchPayment, mollieFetchRefunds } from "./providers/mollie.js";
import { monobankObserveTransactionFromInvoiceStatus } from "./monobank-verification.js";
import { liqpayObserveTransactionFromStatus } from "./liqpay-verification.js";
import { mollieObserveTransactionFromApi } from "./mollie-verification.js";
import { stageEvent } from "../outbox/stager.js";

export type ResyncTransactionErrorCode =
  | "TX_NOT_FOUND"
  | "TX_TERMINAL_NOOP"
  | "TX_EXTERNAL_ID_MISSING"
  | "PROVIDER_NOT_ACTIVE"
  | "PROVIDER_SECRET_MISSING"
  | "PROVIDER_UNSUPPORTED"
  | "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE"
  | "PROVIDER_AUTH_FAILED"
  | "PROVIDER_RESPONSE_UNPARSABLE"
  | "VERIFY_PERMANENT_LINKAGE_MISMATCH"
  | "PROVIDER_BAD_REQUEST"
  | "PROCESSING_UNEXPECTED_ERROR";

export type ResyncTransactionResult =
  | { ok: true; didUpdate: boolean; code: "OK" | "NOOP"; reason?: string }
  | { ok: false; code: ResyncTransactionErrorCode; reason?: string };

function jitterMs(maxMs: number) {
  return Math.floor(Math.random() * (maxMs + 1));
}

export function computeNextResyncAt(args: { now: Date; nextAttempt: number; capMinutes?: number }) {
  const capMinutes = typeof args.capMinutes === "number" ? args.capMinutes : 30;
  const pow = 2 ** Math.min(args.nextAttempt, 5);
  const minutes = Math.min(capMinutes, pow);
  const ms = minutes * 60 * 1000 + jitterMs(60 * 1000);
  return new Date(args.now.getTime() + ms);
}

function isPrePaid(txStatus: PaymentTransactionStatus) {
  if (txStatus === PaymentTransactionStatus.PAID) return false;
  if (isPostPaidStatus(txStatus)) return false;
  return true;
}

function shouldStopAutomaticRetries(args: { createdAt: Date; nextAttempt: number; now: Date }) {
  if (args.nextAttempt >= 20) return true;
  if (args.createdAt.getTime() < args.now.getTime() - 24 * 60 * 60 * 1000) return true;
  return false;
}

function classifyUpstreamError(err: unknown): {
  kind:
    | "TRANSIENT"
    | "AUTH"
    | "NOT_FOUND"
    | "BAD_REQUEST"
    | "UNPARSABLE"
    | "UNKNOWN";
  status: number | null;
} {
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (
      msg.includes("unexpected response shape") ||
      msg.includes("unparsable") ||
      msg.includes("invalid decimal amount") ||
      msg.includes("too many decimal places")
    ) {
      return { kind: "UNPARSABLE", status: null };
    }
  }
  if (!(err instanceof UpstreamHttpError)) return { kind: "UNKNOWN", status: null };
  const status = err.status;

  if (err.isTimeout || status === null) return { kind: "TRANSIENT", status };
  if (status === 429 || status >= 500) return { kind: "TRANSIENT", status };
  if (status === 401 || status === 403) return { kind: "AUTH", status };
  if (status === 404) return { kind: "NOT_FOUND", status };
  if (err.message.toLowerCase().includes("json parse")) return { kind: "UNPARSABLE", status };
  if (status >= 400 && status < 500) return { kind: "BAD_REQUEST", status };
  return { kind: "UNKNOWN", status };
}

export async function resyncPaymentTransaction(args: {
  prisma: PrismaClient;
  secrets: SecretResolver;
  tenantId: string;
  transactionId: string;
  now?: Date | undefined;
}): Promise<ResyncTransactionResult> {
  const now = args.now ?? new Date();
  let didUpdate = false;

  const tx = await args.prisma.paymentTransaction.findUnique({
    where: { tenantId_id: { tenantId: args.tenantId, id: args.transactionId } },
    select: {
      id: true,
      tenantId: true,
      orderDbId: true,
      providerId: true,
      externalId: true,
      status: true,
      externalStatus: true,
      amountMinor: true,
      currency: true,
      currencyExponent: true,
      refundedAmountMinor: true,
      refundPendingAmountMinor: true,
      paidAt: true,
      refundedAt: true,
      providerLastEventCreatedAt: true,
      resyncAttempt: true,
      nextResyncAt: true,
      createdAt: true,
      order: {
        select: {
          id: true,
          orderId: true,
          token: true,
          status: true,
          financialStatus: true,
          paidAt: true,
          total: true,
        },
      },
      provider: {
        select: {
          id: true,
          tenantId: true,
          type: true,
          status: true,
          credentialsRef: true,
          config: true,
        },
      },
    },
  });

  if (!tx) return { ok: false, code: "TX_NOT_FOUND" };
  if (isTerminalStatus(tx.status)) return { ok: false, code: "TX_TERMINAL_NOOP", reason: String(tx.status) };
  if (!tx.externalId) return { ok: false, code: "TX_EXTERNAL_ID_MISSING" };
  if (tx.provider.status !== "ACTIVE") return { ok: false, code: "PROVIDER_NOT_ACTIVE" };

  let obs: any;

  if (tx.provider.type === "MONOBANK") {
    const tokenRef = tx.provider.credentialsRef;
    const token = tokenRef ? args.secrets.resolve(tokenRef) : undefined;
    if (!token) {
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
          lastErrorCode: "PROVIDER_AUTH_FAILED",
          lastErrorAt: now,
          resyncAttempt: tx.resyncAttempt + 1,
          nextResyncAt: null,
        },
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    let invoice: any;
    try {
      invoice = await monobankFetchInvoiceStatus({ token, invoiceId: tx.externalId, timeoutMs: 4500, retries: 1, backoffMs: 250 });
    } catch (e: unknown) {
      const c = classifyUpstreamError(e);

      if (c.kind === "TRANSIENT") {
        const nextAttempt = tx.resyncAttempt + 1;
        const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" };
      }

      if (c.kind === "AUTH") {
        const nextAttempt = tx.resyncAttempt + 1;
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "PROVIDER_AUTH_FAILED",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: null,
          },
        });
        return { ok: false, code: "PROVIDER_AUTH_FAILED" };
      }

      if (c.kind === "UNPARSABLE") {
        const nextAttempt = tx.resyncAttempt + 1;
        const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "PROVIDER_RESPONSE_UNPARSABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: "PROVIDER_RESPONSE_UNPARSABLE" };
      }

      if (c.kind === "NOT_FOUND") {
        if (isPrePaid(tx.status)) {
          await args.prisma.paymentTransaction.update({
            where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
            data: {
              status: PaymentTransactionStatus.FAILED,
              lastErrorCode: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
              lastErrorAt: now,
              nextResyncAt: null,
            },
          });
        } else {
          await args.prisma.paymentTransaction.update({
            where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
            data: {
              lastErrorCode: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
              lastErrorAt: now,
              nextResyncAt: null,
            },
          });
        }
        return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
      }

      if (c.kind === "BAD_REQUEST") {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            lastErrorCode: "PROVIDER_BAD_REQUEST",
            lastErrorAt: now,
            nextResyncAt: null,
          },
        });
        return { ok: false, code: "PROVIDER_BAD_REQUEST" };
      }

      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          lastErrorCode: "PROCESSING_UNEXPECTED_ERROR",
          lastErrorAt: now,
          nextResyncAt: null,
        },
      });
      return { ok: false, code: "PROCESSING_UNEXPECTED_ERROR" };
    }

    obs = monobankObserveTransactionFromInvoiceStatus({
      invoice,
      tx: {
        id: tx.id,
        status: tx.status,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        refundedAmountMinor: tx.refundedAmountMinor,
        providerLastEventCreatedAt: tx.providerLastEventCreatedAt,
      },
    });
  } else if (tx.provider.type === "LIQPAY") {
    const cfg: any = tx.provider.config ?? {};
    const liqpayCfg: any = cfg.liqpay ?? {};
    const publicKey: string | undefined = typeof liqpayCfg.publicKey === "string" ? liqpayCfg.publicKey : undefined;
    const currentSecretRef: string | undefined = typeof liqpayCfg.currentSecretRef === "string" ? liqpayCfg.currentSecretRef : undefined;
    const privateKey = currentSecretRef ? args.secrets.resolve(currentSecretRef) : undefined;
    const signatureOutAlgorithm: LiqpaySignatureAlgorithm = liqpayCfg.signatureOutAlgorithm === "sha3-256" ? "sha3-256" : "sha1";
    const version: number = Number.isFinite(Number(liqpayCfg.version)) ? Number(liqpayCfg.version) : 3;

    if (!publicKey || !currentSecretRef || !privateKey) {
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
          lastErrorCode: "PROVIDER_AUTH_FAILED",
          lastErrorAt: now,
          resyncAttempt: tx.resyncAttempt + 1,
          nextResyncAt: null,
        },
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    let statusRes: any;
    try {
      statusRes = await liqpayFetchStatus({
        version,
        publicKey,
        privateKey,
        signatureAlgorithm: signatureOutAlgorithm,
        transactionId: tx.id,
        timeoutMs: 4500,
        retries: 1,
        backoffMs: 250,
      });
    } catch (e: unknown) {
      const c = classifyUpstreamError(e);
      if (c.kind === "TRANSIENT") {
        const nextAttempt = tx.resyncAttempt + 1;
        const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" };
      }
      if (c.kind === "AUTH") {
        const nextAttempt = tx.resyncAttempt + 1;
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "PROVIDER_AUTH_FAILED",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: null,
          },
        });
        return { ok: false, code: "PROVIDER_AUTH_FAILED" };
      }
      if (c.kind === "UNPARSABLE") {
        const nextAttempt = tx.resyncAttempt + 1;
        const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "PROVIDER_RESPONSE_UNPARSABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: "PROVIDER_RESPONSE_UNPARSABLE" };
      }
      if (c.kind === "NOT_FOUND") {
        if (isPrePaid(tx.status)) {
          await args.prisma.paymentTransaction.update({
            where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
            data: {
              status: PaymentTransactionStatus.FAILED,
              lastErrorCode: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
              lastErrorAt: now,
              nextResyncAt: null,
            },
          });
        } else {
          await args.prisma.paymentTransaction.update({
            where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
            data: {
              lastErrorCode: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
              lastErrorAt: now,
              nextResyncAt: null,
            },
          });
        }
        return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
      }
      if (c.kind === "BAD_REQUEST") {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            lastErrorCode: "PROVIDER_BAD_REQUEST",
            lastErrorAt: now,
            nextResyncAt: null,
          },
        });
        return { ok: false, code: "PROVIDER_BAD_REQUEST" };
      }
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          lastErrorCode: "PROCESSING_UNEXPECTED_ERROR",
          lastErrorAt: now,
          nextResyncAt: null,
        },
      });
      return { ok: false, code: "PROCESSING_UNEXPECTED_ERROR" };
    }

    let liqObs: any;
    try {
      liqObs = liqpayObserveTransactionFromStatus({
        status: statusRes,
        tx: {
          id: tx.id,
          status: tx.status,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          currencyExponent: tx.currencyExponent,
          refundedAmountMinor: tx.refundedAmountMinor,
        },
      });
    } catch (e: unknown) {
      const nextAttempt = tx.resyncAttempt + 1;
      const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
          lastErrorCode: "PROVIDER_RESPONSE_UNPARSABLE",
          lastErrorAt: now,
          resyncAttempt: nextAttempt,
          nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
        },
      });
      return { ok: false, code: "PROVIDER_RESPONSE_UNPARSABLE" };
    }

    obs = {
      nextStatus: liqObs.nextStatus,
      externalStatus: liqObs.externalStatus,
      providerEventCreatedAt: undefined,
      isStale: false,
      verificationIssue: liqObs.verificationIssue,
      statusIssue: liqObs.statusIssue,
      refundObservation: {
        refundPendingAmountMinor: 0,
        refundedAmountMinor: liqObs.refundedAmountMinor,
        unknownCancelStatuses: [],
      },
    };
  } else if (tx.provider.type === "MOLLIE") {
    const apiKeyRef = tx.provider.credentialsRef;
    const apiKey = apiKeyRef ? args.secrets.resolve(apiKeyRef) : undefined;
    if (!apiKey) {
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
          lastErrorCode: "PROVIDER_AUTH_FAILED",
          lastErrorAt: now,
          resyncAttempt: tx.resyncAttempt + 1,
          nextResyncAt: null,
        },
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    let payment: any;
    let refunds: any;
    let chargebacks: any;
    try {
      payment = await mollieFetchPayment({ apiKey, paymentId: tx.externalId, timeoutMs: 4500, retries: 1, backoffMs: 250 });
      refunds = await mollieFetchRefunds({ apiKey, paymentId: tx.externalId, timeoutMs: 4500, retries: 1, backoffMs: 250 });
      chargebacks = await mollieFetchChargebacks({ apiKey, paymentId: tx.externalId, timeoutMs: 4500, retries: 1, backoffMs: 250 });
    } catch (e: unknown) {
      const c = classifyUpstreamError(e);
      if (c.kind === "TRANSIENT") {
        const nextAttempt = tx.resyncAttempt + 1;
        const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" };
      }
      if (c.kind === "AUTH") {
        const nextAttempt = tx.resyncAttempt + 1;
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "PROVIDER_AUTH_FAILED",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: null,
          },
        });
        return { ok: false, code: "PROVIDER_AUTH_FAILED" };
      }
      if (c.kind === "UNPARSABLE") {
        const nextAttempt = tx.resyncAttempt + 1;
        const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
            lastErrorCode: "PROVIDER_RESPONSE_UNPARSABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: "PROVIDER_RESPONSE_UNPARSABLE" };
      }
      if (c.kind === "NOT_FOUND") {
        if (isPrePaid(tx.status)) {
          await args.prisma.paymentTransaction.update({
            where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
            data: {
              status: PaymentTransactionStatus.FAILED,
              lastErrorCode: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
              lastErrorAt: now,
              nextResyncAt: null,
            },
          });
        } else {
          await args.prisma.paymentTransaction.update({
            where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
            data: {
              lastErrorCode: "VERIFY_PERMANENT_LINKAGE_MISMATCH",
              lastErrorAt: now,
              nextResyncAt: null,
            },
          });
        }
        return { ok: false, code: "VERIFY_PERMANENT_LINKAGE_MISMATCH" };
      }
      if (c.kind === "BAD_REQUEST") {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            lastErrorCode: "PROVIDER_BAD_REQUEST",
            lastErrorAt: now,
            nextResyncAt: null,
          },
        });
        return { ok: false, code: "PROVIDER_BAD_REQUEST" };
      }
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: { lastErrorCode: "PROCESSING_UNEXPECTED_ERROR", lastErrorAt: now, nextResyncAt: null },
      });
      return { ok: false, code: "PROCESSING_UNEXPECTED_ERROR" };
    }

    let mObs: any;
    try {
      mObs = mollieObserveTransactionFromApi({
        payment,
        refunds,
        chargebacks,
        tx: {
          id: tx.id,
          status: tx.status,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          currencyExponent: tx.currencyExponent,
          refundedAmountMinor: tx.refundedAmountMinor,
          orderDbId: tx.orderDbId,
        },
      });
    } catch {
      const nextAttempt = tx.resyncAttempt + 1;
      const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: {
          status: applyMonotonicTransition({ current: tx.status, observed: PaymentTransactionStatus.PENDING_VERIFICATION }),
          lastErrorCode: "PROVIDER_RESPONSE_UNPARSABLE",
          lastErrorAt: now,
          resyncAttempt: nextAttempt,
          nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
        },
      });
      return { ok: false, code: "PROVIDER_RESPONSE_UNPARSABLE" };
    }

    obs = {
      ...mObs,
      providerEventCreatedAt: undefined,
      isStale: false,
    };
  } else {
    return { ok: false, code: "PROVIDER_UNSUPPORTED", reason: String(tx.provider.type) };
  }

  if (obs.isStale) {
    return { ok: true, didUpdate: false, code: "NOOP", reason: "STALE_PROVIDER_EVENT" };
  }

  const isTransitionToPaid = tx.status !== PaymentTransactionStatus.PAID && obs.nextStatus === PaymentTransactionStatus.PAID;
  const isTransitionToRefunded =
    obs.nextStatus === PaymentTransactionStatus.REFUNDED && tx.status !== PaymentTransactionStatus.REFUNDED;
  const isTransitionToPartiallyRefunded =
    obs.nextStatus === PaymentTransactionStatus.PARTIALLY_REFUNDED && tx.status !== PaymentTransactionStatus.PARTIALLY_REFUNDED;
  const isTransitionToChargeback =
    obs.nextStatus === PaymentTransactionStatus.CHARGEBACK && tx.status !== PaymentTransactionStatus.CHARGEBACK;

  await args.prisma.$transaction(async (p) => {
    const hasRefundDrift = (obs.refundObservation?.unknownCancelStatuses?.length ?? 0) > 0;
    const needsAttention = !!obs.verificationIssue || !!obs.statusIssue || hasRefundDrift;

    const nextAttempt = obs.nextStatus === PaymentTransactionStatus.PENDING || obs.nextStatus === PaymentTransactionStatus.PENDING_VERIFICATION
      ? tx.resyncAttempt + 1
      : 0;
    const stop = nextAttempt > 0 && shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });
    const nextResyncAt =
      nextAttempt === 0
        ? null
        : stop
          ? null
          : computeNextResyncAt({ now, nextAttempt });

    const updateRes = await p.paymentTransaction.updateMany({
      where: {
        tenantId: tx.tenantId,
        id: tx.id,
        status: tx.status,
        providerLastEventCreatedAt: tx.providerLastEventCreatedAt,
      },
      data: {
        status: obs.nextStatus,
        externalStatus: obs.externalStatus,
        providerLastEventCreatedAt: obs.providerEventCreatedAt ?? tx.providerLastEventCreatedAt,
        refundedAmountMinor:
          obs.refundObservation?.refundedAmountMinor ??
          (typeof obs.refundedAmountMinor === "number" ? obs.refundedAmountMinor : tx.refundedAmountMinor),
        refundPendingAmountMinor:
          obs.refundObservation?.refundPendingAmountMinor ??
          (typeof obs.refundPendingAmountMinor === "number" ? obs.refundPendingAmountMinor : tx.refundPendingAmountMinor),
        paidAt: obs.nextStatus === PaymentTransactionStatus.PAID && !tx.paidAt ? now : tx.paidAt,
        refundedAt:
          (obs.nextStatus === PaymentTransactionStatus.PARTIALLY_REFUNDED ||
            obs.nextStatus === PaymentTransactionStatus.REFUNDED) &&
          !tx.refundedAt
            ? now
            : tx.refundedAt,
        resyncAttempt: nextAttempt,
        nextResyncAt,
        lastErrorCode: needsAttention
          ? (obs.verificationIssue?.code ??
              obs.statusIssue?.code ??
              (hasRefundDrift ? "PAYMENTS_MONOBANK_UNKNOWN_CANCEL_STATUS" : "PROVIDER_RESPONSE_UNPARSABLE"))
          : null,
        lastErrorAt: needsAttention ? now : null,
      },
    });

    if (updateRes.count !== 1) return;
    didUpdate = obs.nextStatus !== tx.status;

    if (isTransitionToPaid && obs.nextStatus === PaymentTransactionStatus.PAID) {
      // Financial truth (Payment Core is the only writer).
      await p.order.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.orderDbId } },
        data: {
          financialStatus: "PAID",
          paidAt: tx.order.paidAt ?? now,
        },
      });

      // Fulfillment workflow: only set to "paid" from known pre-paid states.
      if (tx.order.status === "created" || tx.order.status === "pending") {
        await p.order.updateMany({
          where: { tenantId: tx.tenantId, id: tx.orderDbId, status: { in: ["created", "pending"] } },
          data: { status: "paid" },
        });
      }

      await stageEvent(p, "order.paid", {
        tenantId: tx.tenantId,
        orderId: tx.order.orderId,
        amount: moneyFromMinor(tx.amountMinor),
        token: tx.order.token,
      });
    }

    // Post-paid financial status updates (no automatic fulfillment status changes).
    if (obs.nextStatus === PaymentTransactionStatus.PARTIALLY_REFUNDED) {
      await p.order.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.orderDbId } },
        data: { financialStatus: "PARTIALLY_REFUNDED" },
      });
    } else if (obs.nextStatus === PaymentTransactionStatus.REFUNDED) {
      await p.order.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.orderDbId } },
        data: { financialStatus: "REFUNDED" },
      });
    } else if (obs.nextStatus === PaymentTransactionStatus.CHARGEBACK) {
      await p.order.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.orderDbId } },
        data: { financialStatus: "CHARGEBACK" },
      });
    }

    if (isTransitionToPartiallyRefunded || isTransitionToRefunded) {
      const refundedAmountMinor =
        obs.refundObservation?.refundedAmountMinor ??
        (typeof obs.refundedAmountMinor === "number" ? obs.refundedAmountMinor : tx.refundedAmountMinor);
      await stageEvent(p, "order.refunded", {
        tenantId: tx.tenantId,
        orderId: tx.order.orderId,
        transactionId: tx.id,
        refundedAmountMinor,
        refundedAmount: moneyFromMinor(refundedAmountMinor),
      });
    }

    if (isTransitionToChargeback) {
      await stageEvent(p, "order.chargeback", {
        tenantId: tx.tenantId,
        orderId: tx.order.orderId,
        transactionId: tx.id,
      });
    }
  });

  return { ok: true, didUpdate, code: didUpdate ? "OK" : "NOOP" };
}
