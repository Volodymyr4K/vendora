import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../monobank-verification.js", async () => {
  const actual = await vi.importActual<any>("../monobank-verification.js");
  return {
    ...actual,
    monobankObserveTransactionFromInvoiceStatus: vi.fn(),
  };
});

import { monobankObserveTransactionFromInvoiceStatus } from "../monobank-verification.js";

describe("resyncPaymentTransaction (chargeback events)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock.mockReset();
    (monobankObserveTransactionFromInvoiceStatus as any).mockReset();
  });

  it("stages order.chargeback when status transitions to CHARGEBACK", async () => {
    (monobankObserveTransactionFromInvoiceStatus as any).mockReturnValue({
      nextStatus: "CHARGEBACK",
      externalStatus: "chargeback",
      providerEventCreatedAt: null,
      isStale: false,
      verificationIssue: null,
      refundObservation: null,
      statusIssue: null,
    });

    const prismaTx = {
      paymentTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      order: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      eventOutbox: { create: vi.fn().mockResolvedValue({ id: "e1" }) },
    };

    const prisma = {
      paymentTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "22222222-2222-4222-8222-222222222222",
          tenantId: "11111111-1111-4111-8111-111111111111",
          orderDbId: "33333333-3333-4333-8333-333333333333",
          providerId: "prov-1",
          externalId: "inv-1",
          status: "PAID",
          externalStatus: null,
          amountMinor: 1000,
          currency: "UAH",
          refundedAmountMinor: 0,
          refundPendingAmountMinor: 0,
          paidAt: new Date("2026-02-24T10:00:00.000Z"),
          refundedAt: null,
          providerLastEventCreatedAt: null,
          resyncAttempt: 0,
          nextResyncAt: null,
          createdAt: new Date("2026-02-24T00:00:00.000Z"),
          order: {
            id: "33333333-3333-4333-8333-333333333333",
            orderId: "ORD-1",
            token: "ot-1",
            status: "paid",
            financialStatus: "PAID",
            paidAt: new Date("2026-02-24T10:00:00.000Z"),
            total: 1000,
          },
          provider: {
            id: "prov-1",
            tenantId: "11111111-1111-4111-8111-111111111111",
            type: "MONOBANK",
            status: "ACTIVE",
            credentialsRef: "MONO_TOKEN",
            config: { webhookTokens: ["tok"], monobank: { webhookPublicKeysPem: ["pem"] } },
          },
        }),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) => fn(prismaTx)),
    } as any;

    const secrets = { resolve: (ref: string) => (ref === "MONO_TOKEN" ? "mono-secret" : undefined) };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          invoiceId: "inv-1",
          status: "success",
          amount: 1000,
          ccy: 980,
          reference: "22222222-2222-4222-8222-222222222222",
          modifiedDate: 1700000100,
          cancelList: [],
        }),
    });

    const { resyncPaymentTransaction } = await import("../resync-transaction.js");
    const res = await resyncPaymentTransaction({
      prisma,
      secrets,
      tenantId: "11111111-1111-4111-8111-111111111111",
      transactionId: "22222222-2222-4222-8222-222222222222",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.didUpdate).toBe(true);
    expect(prismaTx.order.update).toHaveBeenCalled();
    expect(prismaTx.eventOutbox.create).toHaveBeenCalled();
    const createArgs = prismaTx.eventOutbox.create.mock.calls[0]?.[0];
    expect(createArgs.data.eventType).toBe("order.chargeback");
  });
});

