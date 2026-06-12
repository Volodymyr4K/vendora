import { beforeEach, describe, expect, it, vi } from "vitest";
import { resyncPaymentTransaction } from "../resync-transaction.js";

describe("resyncPaymentTransaction (refund events)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock.mockReset();
  });

  it("stages order.refunded when status transitions to PARTIALLY_REFUNDED", async () => {
    const prismaTx = {
      paymentTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      order: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      eventOutbox: { create: vi.fn().mockResolvedValue({ id: "e1" }) },
    };

    const prisma = {
      paymentTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tx-1",
          tenantId: "t-1",
          orderDbId: "order-db-1",
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
            id: "order-db-1",
            orderId: "ORD-1",
            token: "ot-1",
            status: "paid",
            financialStatus: "PAID",
            paidAt: new Date("2026-02-24T10:00:00.000Z"),
            total: 1000,
          },
          provider: {
            id: "prov-1",
            tenantId: "t-1",
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
          reference: "tx-1",
          modifiedDate: 1700000100,
          cancelList: [{ amount: 300, status: "success" }],
        }),
    });

    const res = await resyncPaymentTransaction({
      prisma,
      secrets,
      tenantId: "t-1",
      transactionId: "tx-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.didUpdate).toBe(true);
    expect(prismaTx.order.update).toHaveBeenCalled();
    expect(prismaTx.eventOutbox.create).toHaveBeenCalled();
    const createArgs = prismaTx.eventOutbox.create.mock.calls[0]?.[0];
    expect(createArgs.data.eventType).toBe("order.refunded");
  });
});

