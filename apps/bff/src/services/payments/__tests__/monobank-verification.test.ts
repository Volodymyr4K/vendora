import { describe, expect, it } from "vitest";
import { PaymentTransactionStatus } from "../payment-transaction-status.js";
import {
  monobankDeriveRefundObservation,
  monobankMapInvoiceStatusToNormalizedStatus,
  monobankObserveTransactionFromInvoiceStatus,
  monobankVerifyInvoiceMatchesTransaction,
} from "../monobank-verification.js";

describe("monobank verification", () => {
  it("maps monobank invoice statuses to normalized statuses", () => {
    expect(monobankMapInvoiceStatusToNormalizedStatus("success")).toEqual({ normalized: PaymentTransactionStatus.PAID, isUnknown: false });
    expect(monobankMapInvoiceStatusToNormalizedStatus("created")).toEqual({ normalized: PaymentTransactionStatus.PENDING, isUnknown: false });
    expect(monobankMapInvoiceStatusToNormalizedStatus("processing")).toEqual({ normalized: PaymentTransactionStatus.PENDING, isUnknown: false });
    expect(monobankMapInvoiceStatusToNormalizedStatus("failure")).toEqual({ normalized: PaymentTransactionStatus.FAILED, isUnknown: false });
    expect(monobankMapInvoiceStatusToNormalizedStatus("expired")).toEqual({ normalized: PaymentTransactionStatus.EXPIRED, isUnknown: false });
    expect(monobankMapInvoiceStatusToNormalizedStatus("something-new").isUnknown).toBe(true);
  });

  it("verifies amount/currency/reference and prefers finalAmount", () => {
    const ok = monobankVerifyInvoiceMatchesTransaction({
      tx: { id: "tx-1", amountMinor: 1234, currency: "UAH" },
      invoice: {
        invoiceId: "inv-1",
        status: "success",
        amount: 1234,
        finalAmount: 1234,
        ccy: 980,
        reference: "tx-1",
      },
    });
    expect(ok.ok).toBe(true);

    const mismatch = monobankVerifyInvoiceMatchesTransaction({
      tx: { id: "tx-1", amountMinor: 1234, currency: "UAH" },
      invoice: {
        invoiceId: "inv-1",
        status: "success",
        amount: 1234,
        finalAmount: 999,
        ccy: 980,
        reference: "tx-1",
      },
    });
    expect(mismatch.ok).toBe(false);
    if (!mismatch.ok) expect(mismatch.issue.code).toBe("PAYMENTS_MONOBANK_AMOUNT_MISMATCH");
  });

  it("derives refund pending + refunded amounts from cancelList and does not count unknown statuses", () => {
    const obs = monobankDeriveRefundObservation({
      previousRefundedAmountMinor: 200,
      invoice: {
        invoiceId: "inv-1",
        status: "success",
        amount: 1000,
        ccy: 980,
        cancelList: [
          { amount: 100, status: "processing" },
          { amount: 300, status: "success" },
          { amount: 500, status: "mystery" },
        ],
      },
    });
    expect(obs.refundPendingAmountMinor).toBe(100);
    expect(obs.unknownCancelStatuses).toEqual(["mystery"]);
    expect(obs.refundedAmountMinor).toBe(200);
  });

  it("observes PAID only when verification passes; otherwise uses PENDING_VERIFICATION", () => {
    const tx = {
      id: "tx-1",
      status: PaymentTransactionStatus.INITIATED,
      amountMinor: 1234,
      currency: "UAH",
      refundedAmountMinor: 0,
      providerLastEventCreatedAt: null,
    } as const;

    const ok = monobankObserveTransactionFromInvoiceStatus({
      tx,
      invoice: { invoiceId: "inv-1", status: "success", amount: 1234, ccy: 980, reference: "tx-1", modifiedDate: 1700000100 },
    });
    expect(ok.nextStatus).toBe(PaymentTransactionStatus.PAID);
    expect(ok.verificationIssue).toBeNull();

    const badAmount = monobankObserveTransactionFromInvoiceStatus({
      tx,
      invoice: { invoiceId: "inv-1", status: "success", amount: 999, ccy: 980, reference: "tx-1", modifiedDate: 1700000100 },
    });
    expect(badAmount.nextStatus).toBe(PaymentTransactionStatus.FAILED);
    expect(badAmount.verificationIssue?.code).toBe("PAYMENTS_MONOBANK_AMOUNT_MISMATCH");
  });

  it("applies out-of-order guard using modifiedDate/createdDate", () => {
    const tx = {
      id: "tx-1",
      status: PaymentTransactionStatus.PENDING,
      amountMinor: 1234,
      currency: "UAH",
      refundedAmountMinor: 0,
      providerLastEventCreatedAt: new Date(1700000200 * 1000),
    };

    const stale = monobankObserveTransactionFromInvoiceStatus({
      tx,
      invoice: { invoiceId: "inv-1", status: "success", amount: 1234, ccy: 980, reference: "tx-1", modifiedDate: 1700000100 },
    });
    expect(stale.isStale).toBe(true);
    expect(stale.nextStatus).toBe(PaymentTransactionStatus.PENDING);
  });

  it("derives post-paid statuses PARTIALLY_REFUNDED / REFUNDED based on refundedAmountMinor", () => {
    const baseTx = {
      id: "tx-1",
      status: PaymentTransactionStatus.PAID,
      amountMinor: 1000,
      currency: "UAH",
      refundedAmountMinor: 0,
      providerLastEventCreatedAt: null,
    };

    const partial = monobankObserveTransactionFromInvoiceStatus({
      tx: baseTx,
      invoice: {
        invoiceId: "inv-1",
        status: "success",
        amount: 1000,
        ccy: 980,
        reference: "tx-1",
        cancelList: [{ amount: 300, status: "success" }],
        modifiedDate: 1700000100,
      },
    });
    expect(partial.nextStatus).toBe(PaymentTransactionStatus.PARTIALLY_REFUNDED);

    const full = monobankObserveTransactionFromInvoiceStatus({
      tx: baseTx,
      invoice: {
        invoiceId: "inv-1",
        status: "success",
        amount: 1000,
        ccy: 980,
        reference: "tx-1",
        cancelList: [{ amount: 1000, status: "success" }],
        modifiedDate: 1700000100,
      },
    });
    expect(full.nextStatus).toBe(PaymentTransactionStatus.REFUNDED);
  });

  it("enforces monotonic transitions (PAID does not regress to FAILED)", () => {
    const tx = {
      id: "tx-1",
      status: PaymentTransactionStatus.PAID,
      amountMinor: 1234,
      currency: "UAH",
      refundedAmountMinor: 0,
      providerLastEventCreatedAt: null,
    };

    const res = monobankObserveTransactionFromInvoiceStatus({
      tx,
      invoice: { invoiceId: "inv-1", status: "failure", amount: 1234, ccy: 980, reference: "tx-1", modifiedDate: 1700000100 },
    });
    expect(res.nextStatus).toBe(PaymentTransactionStatus.PAID);
  });
});
