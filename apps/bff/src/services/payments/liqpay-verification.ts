import { applyMonotonicTransition, PaymentTransactionStatus, isPostPaidStatus } from "./payment-transaction-status.js";
import type { LiqpayStatusResponse } from "./providers/liqpay.js";
import { minorFromDecimal } from "./decimal-minor.js";

export type LiqpayVerificationErrorCode =
  | "PAYMENTS_LIQPAY_AMOUNT_MISMATCH"
  | "PAYMENTS_LIQPAY_CURRENCY_MISMATCH"
  | "PAYMENTS_LIQPAY_ORDER_ID_MISMATCH"
  | "PAYMENTS_LIQPAY_UNKNOWN_STATUS";

export type LiqpayVerificationIssue = {
  code: LiqpayVerificationErrorCode;
  message: string;
};

export type LiqpayTransactionSnapshot = {
  id: string;
  status: PaymentTransactionStatus;
  amountMinor: number;
  currency: string;
  currencyExponent: number;
};

export function liqpayMapStatusToNormalized(status: string): { normalized: PaymentTransactionStatus; isUnknown: boolean } {
  const s = status.trim().toLowerCase();
  if (s === "success") return { normalized: PaymentTransactionStatus.PAID, isUnknown: false };
  if (s === "failure" || s === "error") return { normalized: PaymentTransactionStatus.FAILED, isUnknown: false };
  if (s === "processing" || s === "3ds_verify" || s === "captcha_verify") return { normalized: PaymentTransactionStatus.PENDING, isUnknown: false };
  if (s === "reversed") return { normalized: PaymentTransactionStatus.REFUNDED, isUnknown: false };
  return { normalized: PaymentTransactionStatus.PENDING_VERIFICATION, isUnknown: true };
}

export function liqpayVerifyStatusMatchesTransaction(args: {
  status: LiqpayStatusResponse;
  tx: LiqpayTransactionSnapshot;
}): { ok: true; observedAmountMinor: number } | { ok: false; issue: LiqpayVerificationIssue } {
  if (args.status.order_id !== args.tx.id) {
    return { ok: false, issue: { code: "PAYMENTS_LIQPAY_ORDER_ID_MISMATCH", message: "order_id mismatch" } };
  }
  if (args.status.currency.trim().toUpperCase() !== args.tx.currency.trim().toUpperCase()) {
    return { ok: false, issue: { code: "PAYMENTS_LIQPAY_CURRENCY_MISMATCH", message: "currency mismatch" } };
  }
  const observedAmountMinor = minorFromDecimal({ amount: args.status.amount, currencyExponent: args.tx.currencyExponent });
  if (observedAmountMinor !== args.tx.amountMinor) {
    return { ok: false, issue: { code: "PAYMENTS_LIQPAY_AMOUNT_MISMATCH", message: "amount mismatch" } };
  }
  return { ok: true, observedAmountMinor };
}

export type LiqpayObservation = {
  nextStatus: PaymentTransactionStatus;
  externalStatus: string;
  verificationIssue: LiqpayVerificationIssue | null;
  statusIssue: LiqpayVerificationIssue | null;
  refundedAmountMinor: number;
};

export function liqpayObserveTransactionFromStatus(args: {
  status: LiqpayStatusResponse;
  tx: LiqpayTransactionSnapshot & { refundedAmountMinor: number };
}): LiqpayObservation {
  const { normalized, isUnknown } = liqpayMapStatusToNormalized(args.status.status);
  const statusIssue: LiqpayVerificationIssue | null = isUnknown
    ? { code: "PAYMENTS_LIQPAY_UNKNOWN_STATUS", message: `Unknown liqpay status: ${args.status.status}` }
    : null;

  const verify = liqpayVerifyStatusMatchesTransaction({ status: args.status, tx: args.tx });
  const verificationIssue = verify.ok ? null : verify.issue;

  let observed = normalized;
  if (verificationIssue) {
    const isAlreadyPaidOrPostPaid = args.tx.status === PaymentTransactionStatus.PAID || isPostPaidStatus(args.tx.status);
    observed = isAlreadyPaidOrPostPaid ? args.tx.status : PaymentTransactionStatus.FAILED;
  }

  let refundedAmountMinor = args.tx.refundedAmountMinor;
  if (normalized === PaymentTransactionStatus.REFUNDED) {
    refundedAmountMinor = args.tx.amountMinor;
  }

  const nextStatus = applyMonotonicTransition({ current: args.tx.status, observed });

  return {
    nextStatus,
    externalStatus: args.status.status,
    verificationIssue,
    statusIssue,
    refundedAmountMinor,
  };
}
