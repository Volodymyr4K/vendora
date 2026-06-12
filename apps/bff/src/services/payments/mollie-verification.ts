import { applyMonotonicTransition, isPostPaidStatus, PaymentTransactionStatus } from "./payment-transaction-status.js";
import { minorFromDecimal } from "./decimal-minor.js";
import type { MollieChargeback, MolliePayment, MollieRefund } from "./providers/mollie.js";

export type MollieVerificationErrorCode =
  | "PAYMENTS_MOLLIE_AMOUNT_MISMATCH"
  | "PAYMENTS_MOLLIE_CURRENCY_MISMATCH"
  | "PAYMENTS_MOLLIE_METADATA_MISMATCH"
  | "PAYMENTS_MOLLIE_UNKNOWN_STATUS";

export type MollieVerificationIssue = {
  code: MollieVerificationErrorCode;
  message: string;
};

export type MollieTransactionSnapshot = {
  id: string;
  status: PaymentTransactionStatus;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
  refundedAmountMinor: number;
  orderDbId: string;
};

export function mollieMapStatusToNormalized(status: string): { normalized: PaymentTransactionStatus; isUnknown: boolean } {
  const s = status.trim().toLowerCase();
  if (s === "paid") return { normalized: PaymentTransactionStatus.PAID, isUnknown: false };
  if (s === "open" || s === "pending" || s === "authorized") return { normalized: PaymentTransactionStatus.PENDING, isUnknown: false };
  if (s === "canceled") return { normalized: PaymentTransactionStatus.CANCELLED, isUnknown: false };
  if (s === "expired") return { normalized: PaymentTransactionStatus.EXPIRED, isUnknown: false };
  if (s === "failed") return { normalized: PaymentTransactionStatus.FAILED, isUnknown: false };
  return { normalized: PaymentTransactionStatus.PENDING_VERIFICATION, isUnknown: true };
}

export function mollieVerifyPaymentMatchesTransaction(args: {
  payment: MolliePayment;
  tx: MollieTransactionSnapshot;
}): { ok: true } | { ok: false; issue: MollieVerificationIssue } {
  if (args.payment.amount.currency.trim().toUpperCase() !== args.tx.currency.trim().toUpperCase()) {
    return { ok: false, issue: { code: "PAYMENTS_MOLLIE_CURRENCY_MISMATCH", message: "currency mismatch" } };
  }

  const observedAmountMinor = minorFromDecimal({ amount: args.payment.amount.value, currencyExponent: args.tx.currencyExponent });
  if (observedAmountMinor !== args.tx.amountMinor) {
    return { ok: false, issue: { code: "PAYMENTS_MOLLIE_AMOUNT_MISMATCH", message: "amount mismatch" } };
  }

  const meta = args.payment.metadata;
  if (meta && typeof meta === "object") {
    const txId = typeof (meta as any).transactionId === "string" ? (meta as any).transactionId : undefined;
    const orderDbId = typeof (meta as any).orderDbId === "string" ? (meta as any).orderDbId : undefined;
    if (txId && txId !== args.tx.id) {
      return { ok: false, issue: { code: "PAYMENTS_MOLLIE_METADATA_MISMATCH", message: "transactionId metadata mismatch" } };
    }
    if (orderDbId && orderDbId !== args.tx.orderDbId) {
      return { ok: false, issue: { code: "PAYMENTS_MOLLIE_METADATA_MISMATCH", message: "orderDbId metadata mismatch" } };
    }
  }

  return { ok: true };
}

export function mollieDeriveRefundTotals(args: {
  refunds: MollieRefund[];
  currencyExponent: number;
  expectedCurrency: string;
}) {
  let refundPendingAmountMinor = 0;
  let refundedAmountMinor = 0;

  for (const r of args.refunds) {
    if (r.amount.currency.trim().toUpperCase() !== args.expectedCurrency.trim().toUpperCase()) continue;
    const amt = minorFromDecimal({ amount: r.amount.value, currencyExponent: args.currencyExponent });
    const st = r.status.trim().toLowerCase();
    if (st === "queued" || st === "pending" || st === "processing") refundPendingAmountMinor += amt;
    if (st === "refunded") refundedAmountMinor += amt;
  }

  return { refundPendingAmountMinor, refundedAmountMinor };
}

export type MollieObservation = {
  nextStatus: PaymentTransactionStatus;
  externalStatus: string;
  verificationIssue: MollieVerificationIssue | null;
  statusIssue: MollieVerificationIssue | null;
  refundObservation: { refundPendingAmountMinor: number; refundedAmountMinor: number; unknownCancelStatuses: string[] };
};

export function mollieObserveTransactionFromApi(args: {
  payment: MolliePayment;
  refunds: MollieRefund[];
  chargebacks: MollieChargeback[];
  tx: MollieTransactionSnapshot;
}): MollieObservation {
  const { normalized, isUnknown } = mollieMapStatusToNormalized(args.payment.status);
  const statusIssue: MollieVerificationIssue | null = isUnknown
    ? { code: "PAYMENTS_MOLLIE_UNKNOWN_STATUS", message: `Unknown mollie status: ${args.payment.status}` }
    : null;

  const verify = mollieVerifyPaymentMatchesTransaction({ payment: args.payment, tx: args.tx });
  const verificationIssue = verify.ok ? null : verify.issue;

  let observed = normalized;
  if (verificationIssue) {
    const isAlreadyPaidOrPostPaid =
      args.tx.status === PaymentTransactionStatus.PAID || isPostPaidStatus(args.tx.status);
    observed = isAlreadyPaidOrPostPaid ? args.tx.status : PaymentTransactionStatus.FAILED;
  }

  const { refundPendingAmountMinor, refundedAmountMinor } = mollieDeriveRefundTotals({
    refunds: args.refunds,
    currencyExponent: args.tx.currencyExponent,
    expectedCurrency: args.tx.currency,
  });

  // Chargebacks are terminal and override refunded state when present.
  if (args.chargebacks.length > 0) {
    observed = PaymentTransactionStatus.CHARGEBACK;
  } else if (observed === PaymentTransactionStatus.PAID) {
    if (refundedAmountMinor >= args.tx.amountMinor && args.tx.amountMinor > 0) observed = PaymentTransactionStatus.REFUNDED;
    else if (refundedAmountMinor > 0) observed = PaymentTransactionStatus.PARTIALLY_REFUNDED;
  }

  const nextStatus = applyMonotonicTransition({ current: args.tx.status, observed });

  return {
    nextStatus,
    externalStatus: args.payment.status,
    verificationIssue,
    statusIssue,
    refundObservation: { refundPendingAmountMinor, refundedAmountMinor, unknownCancelStatuses: [] },
  };
}

