import { z } from "zod";
import {
    zOrderCreatedEvent,
    zOrderPaidEvent,
    zOrderRefundedEvent,
    zOrderChargebackEvent,
    zOrderStatusChangedEvent,
    zOrderRescheduledEvent,
    zMenuUpdatedEvent
} from "./events.js";

// Centralized Event Registry
// The keys of this map determine the valid EventType union
export const eventSchemas = {
    "order.created": zOrderCreatedEvent,
    "order.paid": zOrderPaidEvent,
    "order.refunded": zOrderRefundedEvent,
    "order.chargeback": zOrderChargebackEvent,
    "order.status_updated": zOrderStatusChangedEvent,
    "order.rescheduled": zOrderRescheduledEvent,
    "menu.updated": zMenuUpdatedEvent
} as const;

// Derived Types
export type EventSchemas = typeof eventSchemas;
export type EventType = keyof EventSchemas;

/**
 * Validates a raw event payload against the central registry.
 * Throws ZodError if validation fails.
 */
export function validateEventPayload(type: string, payload: unknown) {
    const schema = eventSchemas[type as EventType];
    if (!schema) {
        throw new Error(`Unknown event type: ${type}`);
    }
    return schema.parse(payload);
}
