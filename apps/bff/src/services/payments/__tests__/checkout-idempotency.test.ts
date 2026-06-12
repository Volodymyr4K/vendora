import { describe, expect, it, vi } from "vitest";
import {
  PAYMENT_CHECKOUT_SCOPE,
  bindPaymentCheckoutRequest,
  canonicalJson,
  computePaymentCheckoutRequestHash,
  resolvePaymentCheckoutIdempotency,
} from "../checkout-idempotency.js";

describe("checkout-idempotency", () => {
  it("canonicalJson sorts keys (deep)", () => {
    expect(canonicalJson({ b: 1, a: { d: 2, c: 3 } })).toBe("{\"a\":{\"c\":3,\"d\":2},\"b\":1}");
  });

  it("computePaymentCheckoutRequestHash normalizes providerId undefined -> null", () => {
    const h1 = computePaymentCheckoutRequestHash({ orderToken: "ot-1" });
    const h2 = computePaymentCheckoutRequestHash({ orderToken: "ot-1", providerId: null });
    expect(h1).toBe(h2);
  });

  it("resolvePaymentCheckoutIdempotency returns MISS when no record", async () => {
    const prisma = {
      paymentCheckoutRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await resolvePaymentCheckoutIdempotency({
      prisma,
      tenantId: "t1",
      idempotencyKey: "k1",
      requestHash: "h1",
    });

    expect(res).toEqual({ kind: "MISS" });
    expect(prisma.paymentCheckoutRequest.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_scope_idempotencyKey: {
          tenantId: "t1",
          scope: PAYMENT_CHECKOUT_SCOPE,
          idempotencyKey: "k1",
        },
      },
      select: { requestHash: true, transactionId: true },
    });
  });

  it("resolvePaymentCheckoutIdempotency returns HIT when hash matches", async () => {
    const prisma = {
      paymentCheckoutRequest: {
        findUnique: vi.fn().mockResolvedValue({ requestHash: "h1", transactionId: "tx-1" }),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await resolvePaymentCheckoutIdempotency({
      prisma,
      tenantId: "t1",
      idempotencyKey: "k1",
      requestHash: "h1",
    });

    expect(res).toEqual({ kind: "HIT", transactionId: "tx-1" });
  });

  it("resolvePaymentCheckoutIdempotency returns CONFLICT when hash differs", async () => {
    const prisma = {
      paymentCheckoutRequest: {
        findUnique: vi.fn().mockResolvedValue({ requestHash: "h1", transactionId: "tx-1" }),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await resolvePaymentCheckoutIdempotency({
      prisma,
      tenantId: "t1",
      idempotencyKey: "k1",
      requestHash: "h2",
    });

    expect(res).toEqual({ kind: "CONFLICT" });
  });

  it("bindPaymentCheckoutRequest creates row on first use", async () => {
    const prisma = {
      paymentCheckoutRequest: {
        create: vi.fn().mockResolvedValue({ id: "pcr-1" }),
        findUnique: vi.fn(),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await bindPaymentCheckoutRequest({
      prisma,
      tenantId: "t1",
      idempotencyKey: "k1",
      requestHash: "h1",
      orderDbId: "o1",
      providerId: "p1",
      transactionId: "tx-1",
    });

    expect(res).toEqual({ ok: true, created: true, transactionId: "tx-1" });
  });

  it("bindPaymentCheckoutRequest handles unique violation as idempotency HIT", async () => {
    const prisma = {
      paymentCheckoutRequest: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        findUnique: vi.fn().mockResolvedValue({ requestHash: "h1", transactionId: "tx-existing" }),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await bindPaymentCheckoutRequest({
      prisma,
      tenantId: "t1",
      idempotencyKey: "k1",
      requestHash: "h1",
      orderDbId: "o1",
      providerId: null,
      transactionId: "tx-new",
    });

    expect(res).toEqual({ ok: true, created: false, transactionId: "tx-existing" });
  });

  it("bindPaymentCheckoutRequest returns conflict when unique violation but hash differs", async () => {
    const prisma = {
      paymentCheckoutRequest: {
        create: vi.fn().mockRejectedValue({ code: "P2002" }),
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ requestHash: "h1", transactionId: "tx-existing" }) // resolve step
          .mockResolvedValueOnce({ transactionId: "tx-existing" }), // conflict return step
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await bindPaymentCheckoutRequest({
      prisma,
      tenantId: "t1",
      idempotencyKey: "k1",
      requestHash: "h2",
      orderDbId: "o1",
      providerId: null,
      transactionId: "tx-new",
    });

    expect(res).toEqual({ ok: false, code: "IDEMPOTENCY_CONFLICT", existingTransactionId: "tx-existing" });
  });
});

