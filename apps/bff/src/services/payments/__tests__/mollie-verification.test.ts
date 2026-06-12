import { describe, expect, it } from "vitest";
import { PaymentTransactionStatus } from "../payment-transaction-status.js";
import { mollieObserveTransactionFromApi } from "../mollie-verification.js";

describe("mollie verification", () => {
  it("derives CHARGEBACK when any chargeback exists", () => {
    const obs = mollieObserveTransactionFromApi({
      payment: {
        id: "tr_1",
        status: "paid",
        amount: { currency: "UAH", value: "10.00" },
        metadata: { transactionId: "tx-1", orderDbId: "order-1" },
      },
      refunds: [],
      chargebacks: [{ id: "ch_1", amount: { currency: "UAH", value: "10.00" } }],
      tx: {
        id: "tx-1",
        status: PaymentTransactionStatus.PAID,
        amountMinor: 1000,
        currency: "UAH",
        currencyExponent: 2,
        refundedAmountMinor: 0,
        orderDbId: "order-1",
      },
    });

    expect(obs.nextStatus).toBe(PaymentTransactionStatus.CHARGEBACK);
  });

  it("derives PARTIALLY_REFUNDED when refunded total >0 and < amountMinor", () => {
    const obs = mollieObserveTransactionFromApi({
      payment: {
        id: "tr_1",
        status: "paid",
        amount: { currency: "UAH", value: "10.00" },
        metadata: { transactionId: "tx-1", orderDbId: "order-1" },
      },
      refunds: [{ id: "re_1", status: "refunded", amount: { currency: "UAH", value: "3.00" } }],
      chargebacks: [],
      tx: {
        id: "tx-1",
        status: PaymentTransactionStatus.PAID,
        amountMinor: 1000,
        currency: "UAH",
        currencyExponent: 2,
        refundedAmountMinor: 0,
        orderDbId: "order-1",
      },
    });

    expect(obs.nextStatus).toBe(PaymentTransactionStatus.PARTIALLY_REFUNDED);
    expect(obs.refundObservation.refundedAmountMinor).toBe(300);
  });
});

