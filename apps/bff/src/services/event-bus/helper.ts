import { FastifyBaseLogger } from "fastify";
import { EventBus } from "./bus.js";
import { DomainEvents, EventName } from "./types.js";
import crypto from "node:crypto";
import { logger as globalLogger } from "../../lib/logger.js";

/**
 * Publish an order event safely with standardized logging and metrics.
 * Auto-generates eventId and occurredAt.
 * Catches and logs all errors (Fail-Safe).
 */
export async function publishOrderEvent<T extends EventName>(
    eventBus: EventBus | undefined,
    eventName: T,
    // We expect the payload to contain everything EXCEPT the auto-generated fields.
    // We also enforce orderId for context logging.
    payload: Omit<DomainEvents[T], "eventId" | "occurredAt" | "eventType"> & { orderId: string },
    logger?: FastifyBaseLogger
) {
    if (!eventBus) return;

    const log = logger || globalLogger;

    try {
        // Construct standard event envelope
        const eventId = crypto.randomUUID();
        const occurredAt = new Date().toISOString();

        // We cast because TS struggles with Omit + Discriminated Unions sometimes, 
        // but at runtime we are ensuring the shape.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const fullPayload: any = {
            ...payload,
            eventId,
            occurredAt,
            eventType: eventName // Enforce eventType matching the topic
        };

        await eventBus.publish(eventName, fullPayload);
    } catch (err) {
        // Fail-Safe: Log error but do not throw
        log.error({
            err,
            eventType: eventName,
            orderId: payload.orderId
        }, "Failed to publish order event");
    }
}
