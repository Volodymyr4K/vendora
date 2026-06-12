import { describe, expect, it, vi } from "vitest";

vi.mock("../resync-transaction.js", async () => {
  const actual = await vi.importActual<any>("../resync-transaction.js");
  return { ...actual, resyncPaymentTransaction: vi.fn() };
});

import { register } from "../../../lib/metrics.js";
import { resyncExternalPayment } from "../resync-external.js";
import { resyncPaymentTransaction } from "../resync-transaction.js";

async function getMetricValue(args: { name: string; labels: Record<string, string> }) {
  const all = await register.getMetricsAsJSON();
  const m = all.find((x) => x.name === args.name);
  const rows: any[] = (m as any)?.metrics ?? (m as any)?.values ?? [];
  const entry = rows.find((row: any) =>
    Object.entries(args.labels).every(([k, v]) => row?.labels?.[k] === v)
  );
  return typeof entry?.value === "number" ? entry.value : 0;
}

describe("resyncExternalPayment (direct tx path)", () => {
  it("marks UNMATCHED events PROCESSED when directTx exists and resync is ok", async () => {
    register.resetMetrics();
    (resyncPaymentTransaction as any).mockResolvedValue({ ok: true, didUpdate: false, code: "NOOP" });

    const prisma = {
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-1",
          tenantId: "t-1",
          type: "MOLLIE",
          status: "ACTIVE",
          credentialsRef: null,
        }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue({ id: "tx-1" }),
      },
      paymentEvent: {
        updateMany: vi.fn().mockResolvedValue({ count: 2 }),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as any;

    const res = await resyncExternalPayment({
      prisma,
      secrets: { resolve: () => undefined },
      tenantId: "t-1",
      providerId: "prov-1",
      externalId: "ext-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    expect(prisma.paymentEvent.updateMany).toHaveBeenCalledWith({
      where: { tenantId: "t-1", providerId: "prov-1", externalId: "ext-1", status: "UNMATCHED" },
      data: { status: "PROCESSED", transactionId: "tx-1", processedAt: new Date("2026-02-24T12:00:00.000Z") },
    });
    expect(await getMetricValue({
      name: "payments_event_status_transitions_total",
      labels: { status_from: "UNMATCHED", status_to: "PROCESSED" },
    })).toBe(2);
  });

  it("marks UNMATCHED events PROCESSED when directTx exists but is terminal no-op", async () => {
    register.resetMetrics();
    (resyncPaymentTransaction as any).mockResolvedValue({ ok: false, code: "TX_TERMINAL_NOOP" });

    const prisma = {
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-1",
          tenantId: "t-1",
          type: "MOLLIE",
          status: "ACTIVE",
          credentialsRef: null,
        }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue({ id: "tx-1" }),
      },
      paymentEvent: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findFirst: vi.fn(),
        update: vi.fn(),
      },
    } as any;

    const res = await resyncExternalPayment({
      prisma,
      secrets: { resolve: () => undefined },
      tenantId: "t-1",
      providerId: "prov-1",
      externalId: "ext-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.didResync).toBe(false);
    expect(await getMetricValue({
      name: "payments_event_status_transitions_total",
      labels: { status_from: "UNMATCHED", status_to: "PROCESSED" },
    })).toBe(1);
  });

  it("bumps UNMATCHED when directTx exists but resync fails", async () => {
    register.resetMetrics();
    (resyncPaymentTransaction as any).mockResolvedValue({ ok: false, code: "PROVIDER_SECRET_MISSING" });

    const prisma = {
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-1",
          tenantId: "t-1",
          type: "MOLLIE",
          status: "ACTIVE",
          credentialsRef: null,
        }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue({ id: "tx-1" }),
      },
      paymentEvent: {
        updateMany: vi.fn(),
        findFirst: vi.fn().mockResolvedValue({ id: "ev-1", unmatchedAttempt: 0, receivedAt: new Date("2026-02-24T00:00:00.000Z") }),
        update: vi.fn().mockResolvedValue({}),
      },
    } as any;

    const res = await resyncExternalPayment({
      prisma,
      secrets: { resolve: () => undefined },
      tenantId: "t-1",
      providerId: "prov-1",
      externalId: "ext-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(false);
    expect(prisma.paymentEvent.updateMany).not.toHaveBeenCalled();
    expect(await getMetricValue({
      name: "payments_unmatched_attempts_total",
      labels: { provider_type: "MOLLIE", code: "PROVIDER_SECRET_MISSING", transient: "false" },
    })).toBe(1);
  });
});

