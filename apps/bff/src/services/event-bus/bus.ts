import { Queue, type ConnectionOptions } from "bullmq";
import { MAIN_QUEUE_NAME, DomainEvents, EventName } from "./types.js";
import { logger } from "../../lib/logger.js";
import { eventBusPublished, eventBusDuration } from "../../lib/metrics.js";

export class EventBus {
    private queue: Queue;

    constructor(connection: ConnectionOptions | string) {
        const resolved: ConnectionOptions = typeof connection === "string" ? { url: connection } : connection;
        this.queue = new Queue(MAIN_QUEUE_NAME, {
            connection: resolved,
            defaultJobOptions: {
                attempts: 3,
                backoff: {
                    type: "exponential",
                    delay: 1000,
                },
                removeOnComplete: { count: 100 },
                removeOnFail: { count: 1000 },
            },
        });
        logger.info("[Vendora EventBus] Publisher initialized");
    }

    async publish<K extends EventName>(event: K, payload: DomainEvents[K]) {
        const startTime = Date.now(); // Phase 3: Metrics tracking

        try {
            // EventBus dedupe:
            // We want to prevent duplicate enqueues for the same logical event (e.g. outbox retries/races),
            // but we do NOT want to throttle re-publishes for long windows by default.
            // Therefore we use BullMQ "simple mode" deduplication (no TTL): the key is removed on finalization.
            const eventId = (payload as unknown as { eventId?: unknown })?.eventId;
            const tenantId = (payload as unknown as { tenantId?: unknown })?.tenantId;
            if (process.env.NODE_ENV === "production") {
                if (!(typeof eventId === "string" && eventId.length > 0)) {
                    logger.error(
                        {
                            event,
                            eventIdType: typeof eventId,
                            tenantId: typeof tenantId === "string" ? tenantId : undefined,
                        },
                        "[Vendora EventBus] Missing eventId; deduplication disabled"
                    );
                }
            }
            const opts =
                typeof eventId === "string" && eventId.length > 0
                    ? { deduplication: { id: `event:${eventId}` } }
                    : undefined;

            await this.queue.add(event, payload, opts);

            // Phase 3: Track success
            const duration = (Date.now() - startTime) / 1000;
            eventBusDuration.observe({ event_name: event }, duration);
            eventBusPublished.inc({ event_name: event, success: 'true' });

            logger.debug({ event }, "[Vendora EventBus] Event published");
        } catch (error) {
            // Phase 3: Track failure
            const duration = (Date.now() - startTime) / 1000;
            eventBusDuration.observe({ event_name: event }, duration);
            eventBusPublished.inc({ event_name: event, success: 'false' });

            logger.error({ event, error }, "[Vendora EventBus] Failed to publish event");
            throw error;
        }
    }

    async close() {
        await this.queue.close();
    }
}
