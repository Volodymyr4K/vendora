import { describe, expect, it } from "vitest";
import { PaymentTransactionStatus } from "../payment-transaction-status.js";
import { liqpayObserveTransactionFromStatus } from "../liqpay-verification.js";

describe("liqpay verification", () => {
  it("maps reversed to REFUNDED and sets refundedAmountMinor = amountMinor", () => {
    const obs = liqpayObserveTransactionFromStatus({
      status: { status: "reversed", amount: "10.00", currency: "UAH", order_id: "tx-1" },
      tx: {
        id: "tx-1",
        status: PaymentTransactionStatus.PAID,
        amountMinor: 1000,
        currency: "UAH",
        currencyExponent: 2,
        refundedAmountMinor: 0,
      },
    });
    expect(obs.nextStatus).toBe(PaymentTransactionStatus.REFUNDED);
    expect(obs.refundedAmountMinor).toBe(1000);
  });

  it("fails pre-paid transactions on amount mismatch", () => {
    const obs = liqpayObserveTransactionFromStatus({
      status: { status: "success", amount: "9.99", currency: "UAH", order_id: "tx-1" },
      tx: {
        id: "tx-1",
        status: PaymentTransactionStatus.PENDING,
        amountMinor: 1000,
        currency: "UAH",
        currencyExponent: 2,
        refundedAmountMinor: 0,
      },
    });
    expect(obs.nextStatus).toBe(PaymentTransactionStatus.FAILED);
    expect(obs.verificationIssue?.code).toBe("PAYMENTS_LIQPAY_AMOUNT_MISMATCH");
  });
});

