import { describe, expect, it, vi } from "vitest";

vi.mock("../resync-transaction.js", async () => {
  const actual = await vi.importActual<any>("../resync-transaction.js");
  return {
    ...actual,
    resyncPaymentTransaction: vi.fn(),
  };
});

import { processPaymentWebhookEvent } from "../webhook-process.js";
import { resyncPaymentTransaction } from "../resync-transaction.js";
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

describe("processPaymentWebhookEvent", () => {
  it("marks event UNMATCHED and enqueues resync.external when tx is missing", async () => {
    register.resetMetrics();
    const enqueueResyncExternal = vi.fn().mockResolvedValue({ jobId: "j1" });

    const prisma = {
      paymentEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ev-1",
          tenantId: "t-1",
          providerId: "prov-1",
          transactionId: null,
          externalId: "inv-1",
          status: "RECEIVED",
          providerEventCreatedAt: null,
          unmatchedAttempt: 0,
          receivedAt: new Date("2026-02-24T00:00:00.000Z"),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({ id: "prov-1", tenantId: "t-1", type: "MONOBANK", status: "ACTIVE" }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as any;

    const res = await processPaymentWebhookEvent({
      prisma,
      secrets: { resolve: () => undefined },
      paymentsQueue: { enqueueResyncExternal } as any,
      paymentEventId: "ev-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.code).toBe("UNMATCHED");
    expect(prisma.paymentEvent.updateMany).toHaveBeenCalled();
    expect(enqueueResyncExternal).toHaveBeenCalledWith({ tenantId: "t-1", providerId: "prov-1", externalId: "inv-1" });

    expect(await getMetricValue({ name: "payments_event_status_transitions_total", labels: { status_from: "RECEIVED", status_to: "UNMATCHED" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_webhook_process_total", labels: { result: "unmatched" } })).toBe(1);
  });

  it("no-ops stale events without calling provider API", async () => {
    register.resetMetrics();
    (resyncPaymentTransaction as any).mockResolvedValue({ ok: true, didUpdate: false, code: "NOOP" });

    const prisma = {
      paymentEvent: {
        findUnique: vi.fn().mockResolvedValue({
          id: "ev-1",
          tenantId: "t-1",
          providerId: "prov-1",
          transactionId: null,
          externalId: "inv-1",
          status: "RECEIVED",
          providerEventCreatedAt: new Date("2026-02-24T10:00:00.000Z"),
          unmatchedAttempt: 0,
          receivedAt: new Date("2026-02-24T00:00:00.000Z"),
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentProvider: {
        findUnique: vi.fn().mockResolvedValue({ id: "prov-1", tenantId: "t-1", type: "MONOBANK", status: "ACTIVE" }),
      },
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tx-1",
          status: "PENDING",
          providerLastEventCreatedAt: new Date("2026-02-24T11:00:00.000Z"),
        }),
      },
    } as any;

    const res = await processPaymentWebhookEvent({
      prisma,
      secrets: { resolve: () => undefined },
      paymentEventId: "ev-1",
      now: new Date("2026-02-24T12:00:00.000Z"),
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.reason).toBe("STALE_EVENT");
    expect(resyncPaymentTransaction).not.toHaveBeenCalled();

    expect(await getMetricValue({ name: "payments_event_status_transitions_total", labels: { status_from: "RECEIVED", status_to: "PROCESSED" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_webhook_process_total", labels: { result: "noop_stale_event" } })).toBe(1);
  });
});
