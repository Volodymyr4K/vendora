import { prisma, OutboxStatus } from "@vendora/database";
import { EventBus } from "../event-bus/bus.js";
import { RedisLock } from "../redis-lock.js";
import { logger } from "../../lib/logger.js";
import type { Metrics } from "../../observability/metrics.js";
import {
    eventSchemas,
    EventType
} from "@vendora/contracts";


const MAX_BATCH_SIZE = 50;
const LOCK_KEY = "cron:outbox-relay";
const METRICS_INTERVAL = 15000; // 15 seconds

// Safe Runtime Type Guard
function isEventType(x: string): x is EventType {
    return Object.prototype.hasOwnProperty.call(eventSchemas, x);
}

export function startOutboxRelay(
    eventBus: EventBus,
    metrics?: Metrics,
    opts?: {
        pollIntervalMs?: number;
        lockTtlSeconds?: number;
    }
) {
    logger.info("[OutboxRelay] Starting background worker...");

    const pollIntervalMs = opts?.pollIntervalMs && opts.pollIntervalMs > 0 ? Math.floor(opts.pollIntervalMs) : 3000;
    const lockTtlSeconds = opts?.lockTtlSeconds && opts.lockTtlSeconds > 0 ? Math.floor(opts.lockTtlSeconds) : 30;

    // 1. Processing Loop
    setInterval(async () => {
        try {
            // Avoid Redis lock traffic when there's no work (saves Upstash command quota).
            const hasWork = await prisma.eventOutbox.findFirst({
                where: {
                    OR: [
                        { status: OutboxStatus.PENDING },
                        { status: OutboxStatus.PROCESSING }
                    ],
                    nextAttemptAt: { lte: new Date() }
                },
                select: { id: true }
            });
            if (!hasWork) return;

            await RedisLock.withLock(LOCK_KEY, lockTtlSeconds, async () => {
                await processOutboxBatch(eventBus);
            });
        } catch (error) {
            // Lock contention
        }
    }, pollIntervalMs);

    // 2. Metrics Loop (Slower cadence)
    if (metrics) {
        setInterval(async () => {
        try {
            const [pending, processing, dead] = await Promise.all([
                prisma.eventOutbox.count({ where: { status: OutboxStatus.PENDING } }),
                prisma.eventOutbox.count({ where: { status: OutboxStatus.PROCESSING } }),
                prisma.eventOutbox.count({ where: { status: OutboxStatus.DEAD } })
            ]);

            metrics.outboxPending.set(pending);
            metrics.outboxProcessing.set(processing);
            metrics.outboxDead.set(dead);

            // Compute Age (Oldest READY pending event)
            const oldest = await prisma.eventOutbox.findFirst({
                where: {
                    status: OutboxStatus.PENDING,
                    nextAttemptAt: { lte: new Date() }
                },
                orderBy: { nextAttemptAt: 'asc' },
                select: { nextAttemptAt: true }
            });

            if (oldest) {
                // Age is how long it has been waiting since it was scheduled to run
                const ageSeconds = (Date.now() - oldest.nextAttemptAt.getTime()) / 1000;
                metrics.outboxOldestAge.set(ageSeconds > 0 ? ageSeconds : 0);
            } else {
                metrics.outboxOldestAge.set(0);
            }

        } catch (err) {
            logger.warn({ err }, "[OutboxRelay] Failed to update metrics");
        }
        }, METRICS_INTERVAL);
    }
}


async function processOutboxBatch(eventBus: EventBus) {
    // 1. Fetch Candidate IDs (PENDING or Stale PROCESSING)
    // We strictly prioritize PENDING to process new events fast.
    // Stale PROCESSING events are handled by allowing them to be picked up 
    // if nextAttemptAt < now (Visibility Timeout).
    const candidates = await prisma.eventOutbox.findMany({
        where: {
            OR: [
                { status: OutboxStatus.PENDING },
                { status: OutboxStatus.PROCESSING }
            ],
            nextAttemptAt: { lte: new Date() }
        },
        take: MAX_BATCH_SIZE,
        orderBy: { createdAt: "asc" },
        select: { id: true }
    });

    if (candidates.length === 0) return;

    const ids = candidates.map(c => c.id);

    // 2. Atomic Claim (Mark PROCESSING + Extend Visibility Timeout)
    // This prevents other instances (if lock expires) from picking them up immediately.
    // Visibility Timeout = 60s (plenty of time to process batch)
    const CLAIM_TIMEOUT_MS = 60000;

    const now = new Date();

    // Use individual updates with a predicate to ensure we ONLY claim rows
    // that are still PENDING or Stale PROCESSING. This prevents race conditions.
    const claimPromises = ids.map(id =>
        prisma.eventOutbox.update({
            where: {
                id,
                OR: [
                    { status: OutboxStatus.PENDING },
                    { status: OutboxStatus.PROCESSING, nextAttemptAt: { lte: now } }
                ]
            },
            data: {
                status: OutboxStatus.PROCESSING,
                nextAttemptAt: new Date(now.getTime() + CLAIM_TIMEOUT_MS)
            }
        })
    );

    const matchResults = await Promise.allSettled(claimPromises);

    const claimedIds = matchResults
        .filter(r => r.status === 'fulfilled')
        .map(r => (r as PromiseFulfilledResult<{ id: string }>).value.id);

    if (claimedIds.length === 0) return;

    // 3. Process Claimed Events
    const events = await prisma.eventOutbox.findMany({
        where: { id: { in: claimedIds } }
    });

    logger.debug({ count: events.length }, "[OutboxRelay] Processing claimed batch");

    for (const record of events) {
        try {
            // 4. Strict Validation
            if (!isEventType(record.eventType)) {
                throw new Error(`Unknown event type: ${record.eventType}`);
            }

            const schema = eventSchemas[record.eventType];

            const parseResult = schema.safeParse(record.payload);

            if (!parseResult.success) {
                // Determine if failure is critical (missing eventId/orderId) strict unrecoverable
                // or just schema mismatch (version skew?)
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const raw = record.payload as any;
                const isCritical = !raw.eventId || !raw.orderId;

                logger.error({
                    type: "OUTBOX_PAYLOAD_INVALID",
                    eventId: raw.eventId || "unknown",
                    orderId: raw.orderId || "unknown",
                    eventType: record.eventType,
                    attempts: record.attempts,
                    errors: parseResult.error.format(),
                    isCritical
                }, "Outbox payload validation failed");

                if (isCritical) {
                    // Mark DEAD immediately
                    await prisma.eventOutbox.update({
                        where: { id: record.id },
                        data: {
                            status: OutboxStatus.DEAD,
                            lastError: "Critical Validation Failure: Missing core fields"
                        }
                    });
                    continue; // Skip publish, skip retry logic
                } else {
                    // Treat as normal failure (will trigger retry/backoff below)
                    // We throw here to fall into the catch block which handles attempts & backoff
                    throw new Error(`Validation Failed: ${parseResult.error.issues[0]?.message}`);
                }
            }

            // 5. Publish
            // We cast record.eventType because we validated it exists in eventSchemas, 
            // but TS needs to know it matches the EventBus key.
            // Since we use the schema to validate the payload, parseResult.data IS the correct type.
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            await eventBus.publish(record.eventType as any, parseResult.data);

            // 6. Mark SENT
            await prisma.eventOutbox.update({
                where: { id: record.id },
                data: {
                    status: OutboxStatus.SENT,
                    nextAttemptAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365) // forever
                }
            });
        } catch (error) {
            const err = error instanceof Error ? error : new Error(String(error));
            logger.warn({ id: record.id, err }, "[OutboxRelay] Failed to publish event");

            // 7. Handle Failure (Revert to PENDING or DEAD)
            const attempts = record.attempts + 1;
            if (attempts >= 5) {
                await prisma.eventOutbox.update({
                    where: { id: record.id },
                    data: {
                        status: OutboxStatus.DEAD,
                        attempts,
                        lastError: err.message
                    }
                });

                // Structured Logging for Alerting
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                const payload = record.payload as any;
                logger.error({
                    type: "OUTBOX_DEAD",
                    eventId: payload.eventId || "unknown",
                    orderId: payload.orderId || "unknown",
                    eventType: record.eventType,
                    attempts,
                    lastError: err.message
                }, "Event reached Max Attempts and is now DEAD");
            } else {
                // Exponential backoff
                const backoffMs = Math.pow(2, attempts) * 1000;
                await prisma.eventOutbox.update({
                    where: { id: record.id },
                    data: {
                        status: OutboxStatus.PENDING, // Revert to PENDING to be retried later
                        attempts,
                        nextAttemptAt: new Date(Date.now() + backoffMs),
                        lastError: err.message
                    }
                });
            }
        }
    }
}
