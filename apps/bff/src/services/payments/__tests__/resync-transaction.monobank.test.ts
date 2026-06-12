import { beforeEach, describe, expect, it, vi } from "vitest";
import { resyncPaymentTransaction } from "../resync-transaction.js";

describe("resyncPaymentTransaction (monobank)", () => {
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
          providerId: "prov-1",
          externalId: "inv-1",
          status: "PENDING",
          externalStatus: null,
          amountMinor: 1234,
          currency: "UAH",
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
            total: 1234,
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
          amount: 1234,
          ccy: 980,
          reference: "tx-1",
          modifiedDate: 1700000100,
          cancelList: [],
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
    if (res.ok) expect(res.code).toBe("OK");
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prismaTx.order.update).toHaveBeenCalledTimes(1);
    expect(prismaTx.eventOutbox.create).toHaveBeenCalledTimes(1);
  });
});
