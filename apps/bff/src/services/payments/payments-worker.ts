import { Job, Worker, type ConnectionOptions } from "bullmq";
import type { PrismaClient } from "@vendora/database";

import { logger } from "../../lib/logger.js";
import type { SecretResolver } from "../secrets.js";
import type { PaymentsQueue } from "./payments-queue.js";
import { recoverCheckoutForTransaction } from "./checkout-recover.js";
import { processPaymentWebhookEvent } from "./webhook-process.js";
import { resyncPaymentTransaction } from "./resync-transaction.js";
import { resyncExternalPayment } from "./resync-external.js";

const QUEUE_NAME = "vendora-payments";

export class PaymentsWorkerFactory {
  private worker: Worker | undefined;
  private readonly connection: ConnectionOptions;
  private readonly concurrency: number;
  private readonly drainDelaySec: number;
  private readonly stalledIntervalMs: number;

  constructor(args: {
    connection: ConnectionOptions | string;
    concurrency: number;
    drainDelaySec?: number | undefined;
    stalledIntervalMs?: number | undefined;
  }) {
    this.connection = typeof args.connection === "string" ? { url: args.connection } : args.connection;
    this.concurrency = args.concurrency;
    this.drainDelaySec = typeof args.drainDelaySec === "number" && args.drainDelaySec > 0 ? Math.floor(args.drainDelaySec) : 10;
    this.stalledIntervalMs =
      typeof args.stalledIntervalMs === "number" && args.stalledIntervalMs > 0 ? Math.floor(args.stalledIntervalMs) : 120_000;
  }

  start(deps: { prisma: PrismaClient; secrets: SecretResolver; paymentsQueue?: PaymentsQueue | undefined }) {
    this.worker = new Worker(
      QUEUE_NAME,
      async (job: Job) => {
        if (job.name === "health.ping") {
          logger.info({ jobId: job.id }, "[PaymentsWorker] health.ping processed");
          return;
        }

        if (job.name === "webhook.process") {
          const { paymentEventId } = job.data as { paymentEventId?: string };
          if (!paymentEventId) return;
          await processPaymentWebhookEvent({ prisma: deps.prisma, secrets: deps.secrets, paymentsQueue: deps.paymentsQueue, paymentEventId });
          return;
        }

        if (job.name === "resync.transaction") {
          const { tenantId, transactionId } = job.data as { tenantId?: string; transactionId?: string };
          if (!tenantId || !transactionId) return;
          await resyncPaymentTransaction({ prisma: deps.prisma, secrets: deps.secrets, tenantId, transactionId });
          return;
        }

        if (job.name === "resync.external") {
          const { tenantId, providerId, externalId } = job.data as { tenantId?: string; providerId?: string; externalId?: string };
          if (!tenantId || !providerId || !externalId) return;
          await resyncExternalPayment({ prisma: deps.prisma, secrets: deps.secrets, tenantId, providerId, externalId });
          return;
        }

        if (job.name === "checkout.recover") {
          const { tenantId, transactionId } = job.data as { tenantId?: string; transactionId?: string };
          if (!tenantId || !transactionId) return;
          await recoverCheckoutForTransaction({ prisma: deps.prisma, secrets: deps.secrets, tenantId, transactionId });
          return;
        }

        logger.warn({ jobName: job.name, jobId: job.id }, "[PaymentsWorker] Unknown job name (ignored)");
      },
      {
        connection: this.connection,
        concurrency: this.concurrency,
        // drainDelay is in seconds (BullMQ long-poll timeout when empty).
        drainDelay: this.drainDelaySec,
        stalledInterval: this.stalledIntervalMs,
      }
    );

    this.worker.on("failed", (job, err) => {
      logger.error({ jobId: job?.id, jobName: job?.name, err }, "[PaymentsWorker] Job failed");
    });

    logger.info(
      { concurrency: this.concurrency, drainDelaySec: this.drainDelaySec, stalledIntervalMs: this.stalledIntervalMs },
      "[PaymentsWorker] Started"
    );
  }

  async close() {
    if (this.worker) await this.worker.close();
  }
}
