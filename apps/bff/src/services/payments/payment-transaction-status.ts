export const PaymentTransactionStatus = {
  INITIATED: "INITIATED",
  PENDING: "PENDING",
  PENDING_VERIFICATION: "PENDING_VERIFICATION",
  PAID: "PAID",
  PARTIALLY_REFUNDED: "PARTIALLY_REFUNDED",
  REFUNDED: "REFUNDED",
  CHARGEBACK: "CHARGEBACK",
  FAILED: "FAILED",
  CANCELLED: "CANCELLED",
  EXPIRED: "EXPIRED",
} as const;

export type PaymentTransactionStatus =
  (typeof PaymentTransactionStatus)[keyof typeof PaymentTransactionStatus];

const POST_PAID_STATUSES = new Set<PaymentTransactionStatus>([
  PaymentTransactionStatus.PAID,
  PaymentTransactionStatus.PARTIALLY_REFUNDED,
  PaymentTransactionStatus.REFUNDED,
  PaymentTransactionStatus.CHARGEBACK,
]);

const TERMINAL_STATUSES = new Set<PaymentTransactionStatus>([
  PaymentTransactionStatus.FAILED,
  PaymentTransactionStatus.CANCELLED,
  PaymentTransactionStatus.EXPIRED,
  PaymentTransactionStatus.REFUNDED,
  PaymentTransactionStatus.CHARGEBACK,
]);

const MUTUALLY_ALLOWED_PREPAID_SWAPS = new Set<string>([
  `${PaymentTransactionStatus.PENDING}:${PaymentTransactionStatus.PENDING_VERIFICATION}`,
  `${PaymentTransactionStatus.PENDING_VERIFICATION}:${PaymentTransactionStatus.PENDING}`,
]);

export function isPostPaidStatus(status: PaymentTransactionStatus) {
  return POST_PAID_STATUSES.has(status);
}

export function isTerminalStatus(status: PaymentTransactionStatus) {
  return TERMINAL_STATUSES.has(status);
}

export function canTransitionMonotonically(args: {
  from: PaymentTransactionStatus;
  to: PaymentTransactionStatus;
}) {
  const { from, to } = args;
  if (from === to) return true;

  if (MUTUALLY_ALLOWED_PREPAID_SWAPS.has(`${from}:${to}`)) return true;

  if (isPostPaidStatus(from)) {
    if (to === PaymentTransactionStatus.PAID) return false;

    if (from === PaymentTransactionStatus.PAID) {
      return (
        to === PaymentTransactionStatus.PARTIALLY_REFUNDED ||
        to === PaymentTransactionStatus.REFUNDED ||
        to === PaymentTransactionStatus.CHARGEBACK
      );
    }

    if (from === PaymentTransactionStatus.PARTIALLY_REFUNDED) {
      return to === PaymentTransactionStatus.REFUNDED || to === PaymentTransactionStatus.CHARGEBACK;
    }

    if (from === PaymentTransactionStatus.REFUNDED) {
      return to === PaymentTransactionStatus.CHARGEBACK;
    }

    return false;
  }

  if (isTerminalStatus(from)) return false;

  if (to === PaymentTransactionStatus.PARTIALLY_REFUNDED || to === PaymentTransactionStatus.REFUNDED) {
    return from === PaymentTransactionStatus.PAID || from === PaymentTransactionStatus.PARTIALLY_REFUNDED;
  }

  if (to === PaymentTransactionStatus.CHARGEBACK) {
    return (
      from === PaymentTransactionStatus.PAID ||
      from === PaymentTransactionStatus.PARTIALLY_REFUNDED ||
      from === PaymentTransactionStatus.REFUNDED
    );
  }

  if (to === PaymentTransactionStatus.PAID) {
    return (
      from === PaymentTransactionStatus.INITIATED ||
      from === PaymentTransactionStatus.PENDING ||
      from === PaymentTransactionStatus.PENDING_VERIFICATION
    );
  }

  if (to === PaymentTransactionStatus.PENDING) {
    return from === PaymentTransactionStatus.INITIATED || from === PaymentTransactionStatus.PENDING_VERIFICATION;
  }

  if (to === PaymentTransactionStatus.PENDING_VERIFICATION) {
    return from === PaymentTransactionStatus.INITIATED || from === PaymentTransactionStatus.PENDING;
  }

  if (to === PaymentTransactionStatus.FAILED || to === PaymentTransactionStatus.CANCELLED || to === PaymentTransactionStatus.EXPIRED) {
    return (
      from === PaymentTransactionStatus.INITIATED ||
      from === PaymentTransactionStatus.PENDING ||
      from === PaymentTransactionStatus.PENDING_VERIFICATION
    );
  }

  return false;
}

export function applyMonotonicTransition(args: {
  current: PaymentTransactionStatus;
  observed: PaymentTransactionStatus;
}) {
  return canTransitionMonotonically({ from: args.current, to: args.observed }) ? args.observed : args.current;
}

