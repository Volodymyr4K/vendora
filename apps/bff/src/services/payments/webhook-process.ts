import type { PrismaClient } from "@vendora/database";
import type { SecretResolver } from "../secrets.js";
import type { PaymentsQueue } from "./payments-queue.js";
import { resyncPaymentTransaction } from "./resync-transaction.js";
import { logger } from "../../lib/logger.js";
import { paymentsEventStatusTransitionsTotal, paymentsWebhookProcessTotal } from "../../lib/metrics.js";

export type WebhookProcessResult =
  | { ok: true; code: "NOOP" | "PROCESSED" | "UNMATCHED"; reason?: string }
  | { ok: false; code: "EVENT_NOT_FOUND" | "PROVIDER_NOT_FOUND"; reason?: string };

export async function processPaymentWebhookEvent(args: {
  prisma: PrismaClient;
  secrets: SecretResolver;
  paymentsQueue?: PaymentsQueue | undefined;
  paymentEventId: string;
  now?: Date | undefined;
}): Promise<WebhookProcessResult> {
  const now = args.now ?? new Date();

  const ev = await args.prisma.paymentEvent.findUnique({
    where: { id: args.paymentEventId },
    select: {
      id: true,
      tenantId: true,
      providerId: true,
      transactionId: true,
      externalId: true,
      status: true,
      providerEventCreatedAt: true,
      unmatchedAttempt: true,
      receivedAt: true,
    },
  });
  if (!ev) {
    paymentsWebhookProcessTotal.inc({ result: "event_not_found" });
    return { ok: false, code: "EVENT_NOT_FOUND" };
  }
  if (ev.status === "PROCESSED" || ev.status === "FAILED") {
    paymentsWebhookProcessTotal.inc({ result: "noop_event_terminal" });
    return { ok: true, code: "NOOP", reason: "EVENT_TERMINAL" };
  }

  const provider = await args.prisma.paymentProvider.findUnique({
    where: { id: ev.providerId },
    select: { id: true, tenantId: true, type: true, status: true },
  });
  if (!provider || provider.tenantId !== ev.tenantId) {
    paymentsWebhookProcessTotal.inc({ result: "provider_not_found" });
    return { ok: false, code: "PROVIDER_NOT_FOUND" };
  }

  const tx = await args.prisma.paymentTransaction.findFirst({
    where: { tenantId: ev.tenantId, providerId: ev.providerId, externalId: ev.externalId },
    select: { id: true, status: true, providerLastEventCreatedAt: true },
  });

  if (!tx) {
    // Per SSOT: mark UNMATCHED, set initial backoff window, enqueue resync.external.
    await args.prisma.paymentEvent.updateMany({
      where: { id: ev.id, status: { in: ["RECEIVED", "UNMATCHED"] } },
      data: {
        status: "UNMATCHED",
        unmatchedAttempt: 0,
        unmatchedNextAttemptAt: new Date(now.getTime() + 60 * 1000),
      },
    });
    if (ev.status !== "UNMATCHED") {
      paymentsEventStatusTransitionsTotal.inc({ status_from: ev.status, status_to: "UNMATCHED" });
    }
    paymentsWebhookProcessTotal.inc({ result: "unmatched" });

    if (args.paymentsQueue) {
      args.paymentsQueue
        .enqueueResyncExternal({ tenantId: ev.tenantId, providerId: ev.providerId, externalId: ev.externalId })
        .catch((err) => {
          logger.warn(
            {
              paymentEventId: ev.id,
              providerId: ev.providerId,
              externalId: ev.externalId,
              err: err instanceof Error ? err.message : String(err),
            },
            "[PaymentsWebhookProcess] Failed to enqueue resync.external"
          );
        });
    }

    return { ok: true, code: "UNMATCHED" };
  }

  // Out-of-order protection (monobank uses providerEventCreatedAt / modifiedDate).
  if (ev.providerEventCreatedAt && tx.providerLastEventCreatedAt) {
    if (ev.providerEventCreatedAt.getTime() <= tx.providerLastEventCreatedAt.getTime()) {
      await args.prisma.paymentEvent.updateMany({
        where: { id: ev.id, status: { in: ["RECEIVED", "UNMATCHED"] } },
        data: { status: "PROCESSED", processedAt: now, transactionId: tx.id },
      });
      paymentsEventStatusTransitionsTotal.inc({ status_from: ev.status, status_to: "PROCESSED" });
      paymentsWebhookProcessTotal.inc({ result: "noop_stale_event" });
      return { ok: true, code: "NOOP", reason: "STALE_EVENT" };
    }
  }

  const resync = await resyncPaymentTransaction({
    prisma: args.prisma,
    secrets: args.secrets,
    tenantId: ev.tenantId,
    transactionId: tx.id,
    now,
  });

  if (resync.ok) {
    await args.prisma.paymentEvent.updateMany({
      where: { id: ev.id, status: { in: ["RECEIVED", "UNMATCHED"] } },
      data: { status: "PROCESSED", processedAt: now, transactionId: tx.id },
    });
    paymentsEventStatusTransitionsTotal.inc({ status_from: ev.status, status_to: "PROCESSED" });
    paymentsWebhookProcessTotal.inc({ result: "processed" });
    return { ok: true, code: "PROCESSED" };
  }

  const isSoft =
    resync.code === "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE" ||
    resync.code === "PROVIDER_AUTH_FAILED" ||
    resync.code === "PROVIDER_RESPONSE_UNPARSABLE" ||
    resync.code === "PROVIDER_SECRET_MISSING" ||
    resync.code === "TX_TERMINAL_NOOP" ||
    resync.code === "TX_EXTERNAL_ID_MISSING";

  await args.prisma.paymentEvent.updateMany({
    where: { id: ev.id, status: { in: ["RECEIVED", "UNMATCHED"] } },
    data: {
      status: isSoft ? "PROCESSED" : "FAILED",
      errorCode: resync.code,
      processedAt: now,
      transactionId: tx.id,
    },
  });
  paymentsEventStatusTransitionsTotal.inc({ status_from: ev.status, status_to: isSoft ? "PROCESSED" : "FAILED" });
  paymentsWebhookProcessTotal.inc({ result: isSoft ? "processed_soft" : "failed" });

  return { ok: true, code: isSoft ? "PROCESSED" : "NOOP", reason: resync.code };
}
