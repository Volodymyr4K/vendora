import { describe, expect, it, vi } from "vitest";

vi.mock("../resync-transaction.js", async () => {
  const actual = await vi.importActual<any>("../resync-transaction.js");
  return { ...actual, resyncPaymentTransaction: vi.fn() };
});

vi.mock("../providers/mollie.js", async () => {
  const actual = await vi.importActual<any>("../providers/mollie.js");
  return { ...actual, mollieFetchPayment: vi.fn() };
});

import { resyncPaymentTransaction } from "../resync-transaction.js";
import { mollieFetchPayment } from "../providers/mollie.js";
import { resyncExternalPayment } from "../resync-external.js";

describe("resyncExternalPayment (mollie)", () => {
  it("links by metadata.transactionId and resyncs", async () => {
    (resyncPaymentTransaction as any).mockResolvedValue({ ok: true, didUpdate: false, code: "NOOP" });
    (mollieFetchPayment as any).mockResolvedValue({
      id: "tr_1",
      status: "paid",
      amount: { currency: "UAH", value: "10.00" },
      metadata: { transactionId: "22222222-2222-4222-8222-222222222222", orderDbId: "order-db-1" },
    });

    const prisma = {
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-mollie",
          tenantId: "t-1",
          type: "MOLLIE",
          status: "ACTIVE",
          credentialsRef: "MOLLIE_KEY",
        }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({
          id: "22222222-2222-4222-8222-222222222222",
          providerId: "prov-mollie",
          externalId: null,
          status: "INITIATED",
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentEvent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn().mockResolvedValue({ id: "ev-1", unmatchedAttempt: 0, receivedAt: new Date("2026-02-24T00:00:00.000Z") }),
        update: vi.fn(),
      },
    } as any;

    const res = await resyncExternalPayment({
      prisma,
      secrets: { resolve: (ref: string) => (ref === "MOLLIE_KEY" ? "test_x" : undefined) },
      tenantId: "t-1",
      providerId: "prov-mollie",
      externalId: "tr_1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.didLink).toBe(true);
      expect(res.didResync).toBe(true);
    }
    expect(mollieFetchPayment).toHaveBeenCalled();
    expect(resyncPaymentTransaction).toHaveBeenCalled();
    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalled();
  });
});

