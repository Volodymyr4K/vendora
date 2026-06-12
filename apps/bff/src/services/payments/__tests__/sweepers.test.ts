import { describe, expect, it, vi } from "vitest";
import { runPaymentEventSweeper, runPaymentTransactionSweeper } from "../sweepers.js";
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

describe("payments sweepers", () => {
  it("enqueues checkout.recover and resync.transaction for due transactions", async () => {
    register.resetMetrics();
    const enqueueCheckoutRecover = vi.fn().mockResolvedValue({ jobId: "j1" });
    const enqueueResyncTransaction = vi.fn().mockResolvedValue({ jobId: "j2" });

    const prisma = {
      paymentTransaction: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "tx-init", tenantId: "t1" }])
          .mockResolvedValueOnce([{ id: "tx-pend", tenantId: "t1" }]),
      },
    } as any;

    await runPaymentTransactionSweeper({
      prisma,
      paymentsQueue: { enqueueCheckoutRecover, enqueueResyncTransaction } as any,
      now: new Date("2026-02-24T12:00:00.000Z"),
      batchSize: 10,
    });

    expect(enqueueCheckoutRecover).toHaveBeenCalledWith({ tenantId: "t1", transactionId: "tx-init" });
    expect(enqueueResyncTransaction).toHaveBeenCalledWith({ tenantId: "t1", transactionId: "tx-pend" });

    expect(await getMetricValue({ name: "payments_sweeper_due", labels: { kind: "initiated_no_external_id" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_sweeper_due", labels: { kind: "pending_verification" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_sweeper_enqueued_total", labels: { job: "checkout_recover" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_sweeper_enqueued_total", labels: { job: "resync_transaction" } })).toBe(1);
  });

  it("enqueues webhook.process and resync.external for due events", async () => {
    register.resetMetrics();
    const enqueueWebhookProcess = vi.fn().mockResolvedValue({ jobId: "j1" });
    const enqueueResyncExternal = vi.fn().mockResolvedValue({ jobId: "j2" });

    const prisma = {
      paymentEvent: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: "ev-1" }])
          .mockResolvedValueOnce([{ tenantId: "t1", providerId: "p1", externalId: "x1" }]),
        aggregate: vi.fn().mockResolvedValue({ _count: { _all: 3 }, _min: { receivedAt: new Date("2026-02-24T10:00:00.000Z") } }),
        count: vi.fn().mockResolvedValue(1),
      },
    } as any;

    await runPaymentEventSweeper({
      prisma,
      paymentsQueue: { enqueueWebhookProcess, enqueueResyncExternal } as any,
      now: new Date("2026-02-24T12:00:00.000Z"),
      batchSize: 10,
    });

    expect(enqueueWebhookProcess).toHaveBeenCalledWith({ paymentEventId: "ev-1" });
    expect(enqueueResyncExternal).toHaveBeenCalledWith({ tenantId: "t1", providerId: "p1", externalId: "x1" });

    expect(await getMetricValue({ name: "payments_sweeper_due", labels: { kind: "events_received" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_sweeper_due", labels: { kind: "events_unmatched_due" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_sweeper_enqueued_total", labels: { job: "webhook_process" } })).toBe(1);
    expect(await getMetricValue({ name: "payments_sweeper_enqueued_total", labels: { job: "resync_external" } })).toBe(1);

    expect(await getMetricValue({ name: "payments_unmatched_backlog", labels: {} })).toBe(3);
    expect(await getMetricValue({ name: "payments_unmatched_manual_attention", labels: {} })).toBe(1);
    // now=2026-02-24T12:00:00Z, min receivedAt=10:00 => 2h => 7200s
    expect(await getMetricValue({ name: "payments_unmatched_oldest_age_seconds", labels: {} })).toBe(7200);
  });
});
