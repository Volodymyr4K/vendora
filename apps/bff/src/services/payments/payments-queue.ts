import { Queue, type ConnectionOptions } from "bullmq";
import crypto from "node:crypto";

export type PaymentsQueue = {
  enqueueWebhookProcess: (args: { paymentEventId: string }) => Promise<{ jobId: string }>;
  enqueueResyncTransaction: (args: { tenantId: string; transactionId: string }) => Promise<{ jobId: string }>;
  enqueueResyncExternal: (args: { tenantId: string; providerId: string; externalId: string }) => Promise<{ jobId: string }>;
  enqueueCheckoutRecover: (args: { tenantId: string; transactionId: string }) => Promise<{ jobId: string }>;
  enqueueHealthPing: (args: { pingId: string }) => Promise<{ jobId: string }>;
  close: () => Promise<void>;
};

const QUEUE_NAME = "vendora-payments";

function jobKey(parts: string[]) {
  const input = parts.join("|");
  // BullMQ/Redis keys may reject custom ids that contain too many `:` segments (observed on Upstash).
  // Keep jobId shape: `payments:<name>:<opaque>` where opaque has no ':'.
  return crypto.createHash("sha256").update(input).digest("base64url").slice(0, 32);
}

function jobIdWebhookProcess(paymentEventId: string) {
  return `payments:webhook.process:${paymentEventId}`;
}

function jobIdResyncTransaction(tenantId: string, transactionId: string) {
  return `payments:resync.transaction:${jobKey([tenantId, transactionId])}`;
}

function jobIdResyncExternal(tenantId: string, providerId: string, externalId: string) {
  return `payments:resync.external:${jobKey([tenantId, providerId, externalId])}`;
}

function jobIdCheckoutRecover(tenantId: string, transactionId: string) {
  return `payments:checkout.recover:${jobKey([tenantId, transactionId])}`;
}

function jobIdHealthPing(pingId: string) {
  return `payments:health.ping:${pingId}`;
}

export function createPaymentsQueue(conn: ConnectionOptions): PaymentsQueue {
  const queue = new Queue(QUEUE_NAME, {
    connection: conn,
    defaultJobOptions: {
      removeOnComplete: { count: 100 },
      removeOnFail: { count: 1000 },
      attempts: 10,
      backoff: { type: "exponential", delay: 1000 },
    },
  });

  return {
    async enqueueWebhookProcess(args) {
      const jobId = jobIdWebhookProcess(args.paymentEventId);
      await queue.add("webhook.process", { paymentEventId: args.paymentEventId }, { jobId });
      return { jobId };
    },
    async enqueueResyncTransaction(args) {
      const jobId = jobIdResyncTransaction(args.tenantId, args.transactionId);
      await queue.add("resync.transaction", args, { jobId });
      return { jobId };
    },
    async enqueueResyncExternal(args) {
      const jobId = jobIdResyncExternal(args.tenantId, args.providerId, args.externalId);
      await queue.add("resync.external", args, { jobId });
      return { jobId };
    },
    async enqueueCheckoutRecover(args) {
      const jobId = jobIdCheckoutRecover(args.tenantId, args.transactionId);
      await queue.add("checkout.recover", args, { jobId });
      return { jobId };
    },
    async enqueueHealthPing(args) {
      const jobId = jobIdHealthPing(args.pingId);
      await queue.add("health.ping", args, { jobId });
      return { jobId };
    },
    async close() {
      await queue.close();
    },
  };
}
