import { describe, expect, it, vi } from "vitest";

vi.mock("../resync-transaction.js", async () => {
  const actual = await vi.importActual<any>("../resync-transaction.js");
  return { ...actual, resyncPaymentTransaction: vi.fn() };
});

import { resyncPaymentTransaction } from "../resync-transaction.js";
import { resyncExternalPayment } from "../resync-external.js";
import { register } from "../../../lib/metrics.js";

async function getMetricValue(args: { name: string; labels: Record<string, string> }) {
  const all = await register.getMetricsAsJSON();
  const m = all.find((x) => x.name === args.name);
  const rows: any[] = (m as any)?.metrics ?? (m as any)?.values ?? [];
  const entry = rows.find((row: any) =>
    Object.entries(args.labels).every(([k, v]) => row?.labels?.[k] === v)
  );
  return typeof entry?.value === "number" ? entry.value : 0;
}

describe("resyncExternalPayment (liqpay)", () => {
  it("links by externalId(uuid)=transactionId and resyncs", async () => {
    register.resetMetrics();
    (resyncPaymentTransaction as any).mockResolvedValue({ ok: true, didUpdate: false, code: "NOOP" });

    const prisma = {
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-liq",
          tenantId: "t-1",
          type: "LIQPAY",
          status: "ACTIVE",
          credentialsRef: null,
        }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({
          id: "22222222-2222-4222-8222-222222222222",
          providerId: "prov-liq",
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
      secrets: { resolve: () => undefined },
      tenantId: "t-1",
      providerId: "prov-liq",
      externalId: "22222222-2222-4222-8222-222222222222",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.didLink).toBe(true);
      expect(res.didResync).toBe(true);
    }
    expect(resyncPaymentTransaction).toHaveBeenCalled();
    expect(prisma.paymentTransaction.updateMany).toHaveBeenCalled();
  });

  it("increments give-up metric when UNMATCHED attempts are exhausted", async () => {
    register.resetMetrics();

    const prisma = {
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-liq",
          tenantId: "t-1",
          type: "LIQPAY",
          status: "ACTIVE",
          credentialsRef: null,
        }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
      paymentEvent: {
        findFirst: vi.fn().mockResolvedValue({
          id: "ev-1",
          unmatchedAttempt: 19,
          receivedAt: new Date("2026-02-24T00:00:00.000Z"),
        }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const res = await resyncExternalPayment({
      prisma,
      secrets: { resolve: () => undefined },
      tenantId: "t-1",
      providerId: "prov-liq",
      externalId: "not-a-uuid",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(false);
    expect(await getMetricValue({ name: "payments_unmatched_give_up_total", labels: { provider_type: "LIQPAY" } })).toBe(1);
    expect(await getMetricValue({
      name: "payments_unmatched_attempts_total",
      labels: { provider_type: "LIQPAY", code: "VERIFY_PERMANENT_LINKAGE_MISMATCH", transient: "true" },
    })).toBe(1);
  });
});
