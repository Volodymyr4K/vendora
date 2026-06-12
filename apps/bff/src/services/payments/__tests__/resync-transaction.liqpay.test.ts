import { beforeEach, describe, expect, it, vi } from "vitest";
import { resyncPaymentTransaction } from "../resync-transaction.js";

describe("resyncPaymentTransaction (liqpay)", () => {
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
          id: "22222222-2222-4222-8222-222222222222",
          tenantId: "11111111-1111-4111-8111-111111111111",
          orderDbId: "33333333-3333-4333-8333-333333333333",
          providerId: "prov-liq",
          externalId: "22222222-2222-4222-8222-222222222222",
          status: "PENDING",
          externalStatus: null,
          amountMinor: 1234,
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
            id: "33333333-3333-4333-8333-333333333333",
            orderId: "ORD-1",
            token: "ot-1",
            status: "created",
            financialStatus: "UNPAID",
            paidAt: null,
            total: 1234,
          },
          provider: {
            id: "prov-liq",
            tenantId: "11111111-1111-4111-8111-111111111111",
            type: "LIQPAY",
            status: "ACTIVE",
            credentialsRef: null,
            config: {
              webhookTokens: ["tok"],
              liqpay: { publicKey: "pub", currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureOutAlgorithm: "sha1", version: 3 },
            },
          },
        }),
        update: vi.fn(),
      },
      $transaction: vi.fn(async (fn: any) => fn(prismaTx)),
    } as any;

    const secrets = { resolve: (ref: string) => (ref === "LIQPAY_PRIVATE_KEY" ? "priv" : undefined) };

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          status: "success",
          amount: "12.34",
          currency: "UAH",
          order_id: "22222222-2222-4222-8222-222222222222",
        }),
    });

    const res = await resyncPaymentTransaction({
      prisma,
      secrets,
      tenantId: "11111111-1111-4111-8111-111111111111",
      transactionId: "22222222-2222-4222-8222-222222222222",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    expect(prismaTx.order.update).toHaveBeenCalledTimes(1);
    expect(prismaTx.eventOutbox.create).toHaveBeenCalledTimes(1);
  });
});

