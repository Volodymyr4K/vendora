import { describe, expect, it } from "vitest";
import { applyMonotonicTransition, PaymentTransactionStatus } from "../payment-transaction-status.js";

describe("payment-transaction-status", () => {
  it("allows common pre-paid transitions", () => {
    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.INITIATED,
        observed: PaymentTransactionStatus.PENDING,
      }),
    ).toBe(PaymentTransactionStatus.PENDING);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PENDING,
        observed: PaymentTransactionStatus.PENDING_VERIFICATION,
      }),
    ).toBe(PaymentTransactionStatus.PENDING_VERIFICATION);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PENDING_VERIFICATION,
        observed: PaymentTransactionStatus.PENDING,
      }),
    ).toBe(PaymentTransactionStatus.PENDING);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PENDING,
        observed: PaymentTransactionStatus.PAID,
      }),
    ).toBe(PaymentTransactionStatus.PAID);
  });

  it("allows monotonic post-paid transitions", () => {
    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PAID,
        observed: PaymentTransactionStatus.PARTIALLY_REFUNDED,
      }),
    ).toBe(PaymentTransactionStatus.PARTIALLY_REFUNDED);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PARTIALLY_REFUNDED,
        observed: PaymentTransactionStatus.REFUNDED,
      }),
    ).toBe(PaymentTransactionStatus.REFUNDED);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.REFUNDED,
        observed: PaymentTransactionStatus.CHARGEBACK,
      }),
    ).toBe(PaymentTransactionStatus.CHARGEBACK);
  });

  it("never regresses from paid/post-paid to unpaid/failed", () => {
    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PAID,
        observed: PaymentTransactionStatus.FAILED,
      }),
    ).toBe(PaymentTransactionStatus.PAID);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.PAID,
        observed: PaymentTransactionStatus.PENDING,
      }),
    ).toBe(PaymentTransactionStatus.PAID);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.REFUNDED,
        observed: PaymentTransactionStatus.PARTIALLY_REFUNDED,
      }),
    ).toBe(PaymentTransactionStatus.REFUNDED);
  });

  it("does not transition out of terminal statuses (except explicit chargeback rules)", () => {
    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.CANCELLED,
        observed: PaymentTransactionStatus.PAID,
      }),
    ).toBe(PaymentTransactionStatus.CANCELLED);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.EXPIRED,
        observed: PaymentTransactionStatus.PENDING,
      }),
    ).toBe(PaymentTransactionStatus.EXPIRED);

    expect(
      applyMonotonicTransition({
        current: PaymentTransactionStatus.CHARGEBACK,
        observed: PaymentTransactionStatus.REFUNDED,
      }),
    ).toBe(PaymentTransactionStatus.CHARGEBACK);
  });
});

