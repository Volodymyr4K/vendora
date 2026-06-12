import { beforeEach, describe, expect, it, vi } from "vitest";
import { resyncPaymentTransaction } from "../resync-transaction.js";

describe("resyncPaymentTransaction (mollie)", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(Math, "random").mockReturnValue(0);
    fetchMock.mockReset();
  });

  it("stages order.paid when status transitions to PAID", async () => {
    const prismaTx = {
      paymentTransaction: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      order: { update: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      eventOutbox: { create: vi.fn().mockResolvedValue({ id: "e1" }) },
    };

    const prisma = {
      paymentTransaction: {
        findUnique: vi.fn().mockResolvedValue({
          id: "tx-1",
          tenantId: "t-1",
          orderDbId: "order-db-1",
          providerId: "prov-mollie",
          externalId: "tr_1",
          status: "PENDING",
          externalStatus: null,
          amountMinor: 1000,
          currency: "UAH",
          currencyExponent: 2,
          refundedAmountMinor: 0,
          refundPendingAmountMinor: 0,
          paidAt: null,
          refundedAt: null,
          providerLastEventCreatedAt: null,
          resyncAttempt: 0,
          nextResyncAt: null,
          createdAt: new Date("2026-02-24T00:00:00.000Z"),
          order: {
            id: "order-db-1",
            orderId: "ORD-1",
            token: "ot-1",
            status: "created",
            financialStatus: "UNPAID",
            paidAt: null,
            total: 1000,
          },
          provider: {
            id: "prov-mollie",
            tenantId: "t-1",
            type: "MOLLIE",
            status: "ACTIVE",
            credentialsRef: "MOLLIE_KEY",
            config: { webhookTokens: ["tok"] },
          },
        }),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) => fn(prismaTx)),
    } as any;

    const secrets = { resolve: (ref: string) => (ref === "MOLLIE_KEY" ? "test_x" : undefined) };

    fetchMock
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () =>
          JSON.stringify({
            id: "tr_1",
            status: "paid",
            amount: { currency: "UAH", value: "10.00" },
            metadata: { transactionId: "tx-1", orderDbId: "order-db-1" },
          }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ _embedded: { refunds: [] } }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ "content-type": "application/json" }),
        text: async () => JSON.stringify({ _embedded: { chargebacks: [] } }),
      });

    const res = await resyncPaymentTransaction({
      prisma,
      secrets,
      tenantId: "t-1",
      transactionId: "tx-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    expect(prismaTx.order.update).toHaveBeenCalledTimes(1);
    expect(prismaTx.eventOutbox.create).toHaveBeenCalledTimes(1);
  });
});

