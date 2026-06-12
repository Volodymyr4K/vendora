import type { PrismaClient } from "@vendora/database";
import { logger } from "../../lib/logger.js";
import {
  paymentsSweeperDueGauge,
  paymentsSweeperEnqueuedTotal,
  paymentsSweeperLastSuccessTimestamp,
  paymentsUnmatchedBacklogGauge,
  paymentsUnmatchedManualAttentionGauge,
  paymentsUnmatchedOldestAgeSecondsGauge,
} from "../../lib/metrics.js";
import type { PaymentsQueue } from "./payments-queue.js";

export type PaymentsSweeper = { close: () => void };

export async function runPaymentTransactionSweeper(args: {
  prisma: PrismaClient;
  paymentsQueue: PaymentsQueue;
  now: Date;
  batchSize: number;
}) {
  const now = args.now;
  const initiatedCutoff = new Date(now.getTime() - 2 * 60 * 1000);

  const initiated = await args.prisma.paymentTransaction.findMany({
    where: {
      status: "INITIATED",
      externalId: null,
      nextResyncAt: { lte: now },
      createdAt: { lt: initiatedCutoff },
    },
    select: { id: true, tenantId: true },
    orderBy: { nextResyncAt: "asc" },
    take: args.batchSize,
  });

  paymentsSweeperDueGauge.set({ kind: "initiated_no_external_id" }, initiated.length);
  for (const tx of initiated) {
    args.paymentsQueue.enqueueCheckoutRecover({ tenantId: tx.tenantId, transactionId: tx.id }).catch(() => {});
    paymentsSweeperEnqueuedTotal.inc({ job: "checkout_recover" });
  }

  const pending = await args.prisma.paymentTransaction.findMany({
    where: {
      status: { in: ["PENDING", "PENDING_VERIFICATION"] },
      nextResyncAt: { lte: now },
    },
    select: { id: true, tenantId: true },
    orderBy: { nextResyncAt: "asc" },
    take: args.batchSize,
  });

  paymentsSweeperDueGauge.set({ kind: "pending_verification" }, pending.length);
  for (const tx of pending) {
    args.paymentsQueue.enqueueResyncTransaction({ tenantId: tx.tenantId, transactionId: tx.id }).catch(() => {});
    paymentsSweeperEnqueuedTotal.inc({ job: "resync_transaction" });
  }
}

export async function runPaymentEventSweeper(args: {
  prisma: PrismaClient;
  paymentsQueue: PaymentsQueue;
  now: Date;
  batchSize: number;
  includeBacklogMetrics?: boolean;
}) {
  const now = args.now;
  const receivedCutoff = new Date(now.getTime() - 60 * 1000);

  const received = await args.prisma.paymentEvent.findMany({
    where: { status: "RECEIVED", processedAt: null, receivedAt: { lt: receivedCutoff } },
    select: { id: true },
    orderBy: { receivedAt: "asc" },
    take: args.batchSize,
  });

  paymentsSweeperDueGauge.set({ kind: "events_received" }, received.length);
  for (const ev of received) {
    args.paymentsQueue.enqueueWebhookProcess({ paymentEventId: ev.id }).catch(() => {});
    paymentsSweeperEnqueuedTotal.inc({ job: "webhook_process" });
  }

  const unmatched = await args.prisma.paymentEvent.findMany({
    where: { status: "UNMATCHED", unmatchedNextAttemptAt: { lte: now } },
    select: { tenantId: true, providerId: true, externalId: true },
    orderBy: { unmatchedNextAttemptAt: "asc" },
    take: args.batchSize,
  });

  paymentsSweeperDueGauge.set({ kind: "events_unmatched_due" }, unmatched.length);
  for (const ev of unmatched) {
    args.paymentsQueue.enqueueResyncExternal({ tenantId: ev.tenantId, providerId: ev.providerId, externalId: ev.externalId }).catch(() => {});
    paymentsSweeperEnqueuedTotal.inc({ job: "resync_external" });
  }

  // Backlog/ops gauges are useful but can be expensive on hot DBs.
  // Compute them on a lower cadence (controlled by startPaymentsSweepers).
  if (args.includeBacklogMetrics !== false) {
    try {
      const agg = await args.prisma.paymentEvent.aggregate({
        where: { status: "UNMATCHED" },
        _count: { _all: true },
        _min: { receivedAt: true },
      });
      const manual = await args.prisma.paymentEvent.count({
        where: { status: "UNMATCHED", unmatchedNextAttemptAt: null },
      });

      const backlog = agg._count?._all ?? 0;
      const oldest = agg._min?.receivedAt ?? null;
      const oldestAgeSeconds = oldest ? Math.max(0, Math.floor((now.getTime() - oldest.getTime()) / 1000)) : 0;

      paymentsUnmatchedBacklogGauge.set(backlog);
      paymentsUnmatchedManualAttentionGauge.set(manual);
      paymentsUnmatchedOldestAgeSecondsGauge.set(oldestAgeSeconds);
    } catch (err) {
      logger.warn({ err }, "[PaymentsSweeper] Failed to update UNMATCHED backlog gauges");
    }
  }
}

export function startPaymentsSweepers(args: {
  prisma: PrismaClient;
  paymentsQueue: PaymentsQueue;
  intervalMs: number;
  batchSize: number;
  backlogMetricsIntervalMs?: number;
}): PaymentsSweeper {
  let running = false;
  let tickCount = 0;
  const intervalMs = Math.max(1000, args.intervalMs);
  const backlogMetricsIntervalMs =
    args.backlogMetricsIntervalMs && args.backlogMetricsIntervalMs > 0
      ? Math.floor(args.backlogMetricsIntervalMs)
      : 5 * 60 * 1000;
  const backlogEveryTicks = Math.max(1, Math.ceil(backlogMetricsIntervalMs / intervalMs));

  const tick = async () => {
    if (running) return;
    running = true;
    const now = new Date();
    tickCount += 1;
    const includeBacklogMetrics = tickCount % backlogEveryTicks === 0;
    try {
      await runPaymentTransactionSweeper({ prisma: args.prisma, paymentsQueue: args.paymentsQueue, now, batchSize: args.batchSize });
      await runPaymentEventSweeper({
        prisma: args.prisma,
        paymentsQueue: args.paymentsQueue,
        now,
        batchSize: args.batchSize,
        includeBacklogMetrics
      });
      paymentsSweeperLastSuccessTimestamp.set(Math.floor(now.getTime() / 1000));
    } catch (err) {
      logger.error({ err }, "[PaymentsSweeper] Tick failed");
    } finally {
      running = false;
    }
  };

  const timer = setInterval(() => void tick(), intervalMs);
  void tick();

  logger.info(
    { intervalMs, batchSize: args.batchSize, backlogMetricsIntervalMs },
    "[PaymentsSweeper] Started"
  );

  return {
    close() {
      clearInterval(timer);
    },
  };
}
