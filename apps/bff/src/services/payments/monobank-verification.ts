import { applyMonotonicTransition, isPostPaidStatus, PaymentTransactionStatus } from "./payment-transaction-status.js";
import { iso4217NumericFromAlpha, type MonobankInvoiceStatus } from "./providers/monobank.js";

export type MonobankVerificationErrorCode =
  | "PAYMENTS_MONOBANK_UNSUPPORTED_CURRENCY"
  | "PAYMENTS_MONOBANK_AMOUNT_MISMATCH"
  | "PAYMENTS_MONOBANK_CURRENCY_MISMATCH"
  | "PAYMENTS_MONOBANK_REFERENCE_MISMATCH"
  | "PAYMENTS_MONOBANK_UNKNOWN_INVOICE_STATUS"
  | "PAYMENTS_MONOBANK_UNKNOWN_CANCEL_STATUS";

export type MonobankVerificationIssue = {
  code: MonobankVerificationErrorCode;
  message: string;
};

export type MonobankRefundObservation = {
  refundPendingAmountMinor: number;
  refundedAmountMinor: number;
  unknownCancelStatuses: string[];
};

export type MonobankTransactionSnapshot = {
  id: string;
  status: PaymentTransactionStatus;
  amountMinor: number;
  currency: string;
  refundedAmountMinor: number;
  providerLastEventCreatedAt: Date | null;
};

function dateFromUnixSeconds(seconds?: number): Date | null {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return new Date(seconds * 1000);
}

export function monobankMapInvoiceStatusToNormalizedStatus(status: string): {
  normalized: PaymentTransactionStatus;
  isUnknown: boolean;
} {
  const s = status.trim().toLowerCase();
  if (s === "success") return { normalized: PaymentTransactionStatus.PAID, isUnknown: false };
  if (s === "created" || s === "processing") return { normalized: PaymentTransactionStatus.PENDING, isUnknown: false };
  if (s === "failure") return { normalized: PaymentTransactionStatus.FAILED, isUnknown: false };
  if (s === "expired") return { normalized: PaymentTransactionStatus.EXPIRED, isUnknown: false };
  return { normalized: PaymentTransactionStatus.PENDING_VERIFICATION, isUnknown: true };
}

export function monobankDeriveRefundObservation(args: {
  invoice: MonobankInvoiceStatus;
  previousRefundedAmountMinor: number;
}): MonobankRefundObservation {
  const cancelList = args.invoice.cancelList ?? [];
  const unknownCancelStatuses = new Set<string>();

  let refundPendingAmountMinor = 0;
  let refundedAmountMinorCandidate = 0;

  for (const c of cancelList) {
    if (!c || typeof c.amount !== "number" || !Number.isFinite(c.amount) || c.amount <= 0) continue;
    const st = String(c.status || "").trim().toLowerCase();
    if (st === "processing") {
      refundPendingAmountMinor += c.amount;
      continue;
    }
    if (st === "success") {
      refundedAmountMinorCandidate += c.amount;
      continue;
    }
    if (st.length > 0) unknownCancelStatuses.add(st);
  }

  const unknown = Array.from(unknownCancelStatuses);
  // SSOT: unknown cancel statuses must not be silently counted into refundedAmountMinor.
  const refundedAmountMinor = unknown.length > 0 ? args.previousRefundedAmountMinor : refundedAmountMinorCandidate;

  return { refundPendingAmountMinor, refundedAmountMinor, unknownCancelStatuses: unknown };
}

export function monobankVerifyInvoiceMatchesTransaction(args: {
  invoice: MonobankInvoiceStatus;
  tx: Pick<MonobankTransactionSnapshot, "id" | "amountMinor" | "currency">;
}): { ok: true } | { ok: false; issue: MonobankVerificationIssue } {
  const expectedCcy = iso4217NumericFromAlpha(args.tx.currency);
  if (expectedCcy === null) {
    return {
      ok: false,
      issue: {
        code: "PAYMENTS_MONOBANK_UNSUPPORTED_CURRENCY",
        message: `Unsupported currency for monobank: ${args.tx.currency}`,
      },
    };
  }

  const observedAmount = typeof args.invoice.finalAmount === "number" ? args.invoice.finalAmount : args.invoice.amount;
  if (observedAmount !== args.tx.amountMinor) {
    return {
      ok: false,
      issue: {
        code: "PAYMENTS_MONOBANK_AMOUNT_MISMATCH",
        message: `Amount mismatch: expected=${args.tx.amountMinor} observed=${observedAmount}`,
      },
    };
  }

  if (args.invoice.ccy !== expectedCcy) {
    return {
      ok: false,
      issue: {
        code: "PAYMENTS_MONOBANK_CURRENCY_MISMATCH",
        message: `Currency mismatch: expected=${expectedCcy} observed=${args.invoice.ccy}`,
      },
    };
  }

  if (typeof args.invoice.reference === "string" && args.invoice.reference.trim().length > 0) {
    if (args.invoice.reference !== args.tx.id) {
      return {
        ok: false,
        issue: {
          code: "PAYMENTS_MONOBANK_REFERENCE_MISMATCH",
          message: `Reference mismatch: expected=${args.tx.id} observed=${args.invoice.reference}`,
        },
      };
    }
  }

  return { ok: true };
}

export type MonobankTransactionObservation = {
  nextStatus: PaymentTransactionStatus;
  externalStatus: string;
  providerEventCreatedAt: Date | null;
  isStale: boolean;
  verificationIssue: MonobankVerificationIssue | null;
  refundObservation: MonobankRefundObservation | null;
  statusIssue: MonobankVerificationIssue | null;
};

export function monobankObserveTransactionFromInvoiceStatus(args: {
  invoice: MonobankInvoiceStatus;
  tx: MonobankTransactionSnapshot;
}): MonobankTransactionObservation {
  const providerEventCreatedAt = dateFromUnixSeconds(args.invoice.modifiedDate ?? args.invoice.createdDate);

  const isStale =
    !!providerEventCreatedAt &&
    !!args.tx.providerLastEventCreatedAt &&
    providerEventCreatedAt.getTime() <= args.tx.providerLastEventCreatedAt.getTime();

  const { normalized, isUnknown } = monobankMapInvoiceStatusToNormalizedStatus(args.invoice.status);
  const statusIssue: MonobankVerificationIssue | null = isUnknown
    ? { code: "PAYMENTS_MONOBANK_UNKNOWN_INVOICE_STATUS", message: `Unknown monobank invoice status: ${args.invoice.status}` }
    : null;

  // Always validate the linkage; PAID is only allowed if verification passes.
  const verify = monobankVerifyInvoiceMatchesTransaction({ invoice: args.invoice, tx: args.tx });
  const verificationIssue = verify.ok ? null : verify.issue;

  let observedStatus = normalized;
  if (verificationIssue) {
    // SSOT: amount/currency/reference mismatch is a permanent verification failure.
    // Pre-paid transactions become FAILED; already-paid (or post-paid) must not regress.
    const isAlreadyPaidOrPostPaid =
      args.tx.status === PaymentTransactionStatus.PAID || isPostPaidStatus(args.tx.status);
    observedStatus = isAlreadyPaidOrPostPaid ? args.tx.status : PaymentTransactionStatus.FAILED;
  }

  // Refund observation is meaningful only after PAID (or already post-paid).
  const shouldDeriveRefunds = observedStatus === PaymentTransactionStatus.PAID || isPostPaidStatus(args.tx.status);
  const refundObservation = shouldDeriveRefunds
    ? monobankDeriveRefundObservation({
        invoice: args.invoice,
        previousRefundedAmountMinor: args.tx.refundedAmountMinor,
      })
    : null;

  // Post-paid state derivation is applied after determining base PAID.
  if (!isStale && observedStatus === PaymentTransactionStatus.PAID && refundObservation) {
    if (refundObservation.refundedAmountMinor >= args.tx.amountMinor && args.tx.amountMinor > 0) {
      observedStatus = PaymentTransactionStatus.REFUNDED;
    } else if (refundObservation.refundedAmountMinor > 0) {
      observedStatus = PaymentTransactionStatus.PARTIALLY_REFUNDED;
    }
  }

  // Enforce monotonic transitions.
  const nextStatus = isStale
    ? args.tx.status
    : applyMonotonicTransition({ current: args.tx.status, observed: observedStatus });

  return {
    nextStatus,
    externalStatus: args.invoice.status,
    providerEventCreatedAt,
    isStale,
    verificationIssue,
    refundObservation,
    statusIssue,
  };
}
