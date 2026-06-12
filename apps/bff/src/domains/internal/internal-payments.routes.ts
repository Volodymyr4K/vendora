/**
 * Internal Payments Operational API (SSOT)
 *
 * Protected by x-internal-secret.
 * Enqueues payments resync jobs (requires Redis/BullMQ).
 * Optional sync fallback (when Redis is unavailable) is gated by PAYMENTS_INTERNAL_SYNC_ENABLED=true.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@vendora/database";

import { isValidInternalSecret } from "../../lib/internal-auth.js";
import type { PaymentsQueue } from "../../services/payments/payments-queue.js";
import type { SecretResolver } from "../../services/secrets.js";
import { resyncExternalPayment } from "../../services/payments/resync-external.js";
import { resyncPaymentTransaction } from "../../services/payments/resync-transaction.js";

type Deps = {
  prisma: PrismaClient;
  paymentsQueue?: PaymentsQueue | undefined;
  secrets: SecretResolver;
};

const zResyncTransactionBody = z.object({ transactionId: z.string().uuid() }).strict();
const zResyncExternalBody = z.object({ providerId: z.string().uuid(), externalId: z.string().min(1) }).strict();

export async function routesInternalPayments(app: FastifyInstance, deps: Deps) {
  const syncEnabled = (process.env.PAYMENTS_INTERNAL_SYNC_ENABLED ?? "").trim().toLowerCase() === "true";

  app.post("/internal/payments/resync", async (req, reply) => {
    if (!isValidInternalSecret(req)) return reply.code(403).send({ error: "Forbidden" });

    const body = zResyncTransactionBody.parse(req.body);
    const tx = await deps.prisma.paymentTransaction.findUnique({
      where: { id: body.transactionId },
      select: { id: true, tenantId: true },
    });
    if (!tx) return reply.code(404).send({ error: "PaymentTransaction not found" });

    if (deps.paymentsQueue) {
      const { jobId } = await deps.paymentsQueue.enqueueResyncTransaction({
        tenantId: tx.tenantId,
        transactionId: tx.id,
      });
      return reply.code(202).send({ queued: true, jobId });
    }

    if (!syncEnabled) {
      return reply.code(503).send({ error: "Payments queue disabled", code: "PAYMENTS_QUEUE_DISABLED" });
    }

    const result = await resyncPaymentTransaction({
      prisma: deps.prisma,
      secrets: deps.secrets,
      tenantId: tx.tenantId,
      transactionId: tx.id,
      now: new Date(),
    });
    return reply.code(200).send({ queued: false, mode: "sync", result });
  });

  app.post("/internal/payments/resync/external", async (req, reply) => {
    if (!isValidInternalSecret(req)) return reply.code(403).send({ error: "Forbidden" });

    const body = zResyncExternalBody.parse(req.body);
    const provider = await deps.prisma.paymentProvider.findUnique({
      where: { id: body.providerId },
      select: { id: true, tenantId: true },
    });
    if (!provider) return reply.code(404).send({ error: "PaymentProvider not found" });

    if (deps.paymentsQueue) {
      const { jobId } = await deps.paymentsQueue.enqueueResyncExternal({
        tenantId: provider.tenantId,
        providerId: provider.id,
        externalId: body.externalId,
      });
      return reply.code(202).send({ queued: true, jobId });
    }

    if (!syncEnabled) {
      return reply.code(503).send({ error: "Payments queue disabled", code: "PAYMENTS_QUEUE_DISABLED" });
    }

    const result = await resyncExternalPayment({
      prisma: deps.prisma,
      secrets: deps.secrets,
      tenantId: provider.tenantId,
      providerId: provider.id,
      externalId: body.externalId,
      now: new Date(),
    });
    return reply.code(200).send({ queued: false, mode: "sync", result });
  });
}
