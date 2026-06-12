import { Prisma } from "@vendora/database";
import { DomainEvents, EventName } from "../event-bus/types.js";
import crypto from "node:crypto";

/**
 * Stage an event in the Outbox to be published asynchronously.
 * MUST be called within a Prisma transaction.
 */
export async function stageEvent<K extends EventName>(
    tx: Prisma.TransactionClient,
    eventName: K,
    // Payload should exclude standard event fields as we generate them here
    payload: Omit<DomainEvents[K], "eventId" | "occurredAt" | "eventType">
) {
    const eventId = crypto.randomUUID();
    const occurredAt = new Date().toISOString();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const fullPayload: any = {
        ...payload,
        eventId,
        occurredAt,
        eventType: eventName
    };

    await tx.eventOutbox.create({
        data: {
            eventType: eventName,
            payload: fullPayload,
            status: "PENDING",
            attempts: 0
        }
    });

    return eventId;
}
