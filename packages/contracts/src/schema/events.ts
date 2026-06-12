import { z } from "zod";

// Base Event
const zEventBase = z.object({
    eventId: z.string().uuid(),
    occurredAt: z.string().datetime(),
    tenantId: z.string(),
    // meta: z.record(z.any()).optional()
});

// 1. Order Created
export const zOrderCreatedEvent = zEventBase.extend({
    eventType: z.literal("order.created"),
    orderId: z.string(),
    branchId: z.string().optional(), // branchSlug is usually what we have, but ID is better for events if available. Let's use branchSlug if that's what we have.
    branchSlug: z.string(),
    total: z.number(),
    currency: z.string(),
    userId: z.string().optional(),
});

// 2. Order Paid
export const zOrderPaidEvent = zEventBase.extend({
    eventType: z.literal("order.paid"),
    orderId: z.string(),
    amount: z.number(),
    token: z.string().optional(),
});

// 3. Order Refunded (partial or full)
export const zOrderRefundedEvent = zEventBase.extend({
    eventType: z.literal("order.refunded"),
    orderId: z.string(),
    transactionId: z.string().uuid(),
    refundedAmountMinor: z.number().int().nonnegative(),
    refundedAmount: z.number().nonnegative(),
});

// 4. Chargeback
export const zOrderChargebackEvent = zEventBase.extend({
    eventType: z.literal("order.chargeback"),
    orderId: z.string(),
    transactionId: z.string().uuid(),
});

// 3. Status Changed
export const zOrderStatusChangedEvent = zEventBase.extend({
    eventType: z.literal("order.status_updated"),
    orderId: z.string(),
    oldStatus: z.string().optional().default("unknown"),
    newStatus: z.string(),
});

// 4. Rescheduled
export const zOrderRescheduledEvent = zEventBase.extend({
    eventType: z.literal("order.rescheduled"),
    orderId: z.string(),
    oldDeliveryTime: z.string().nullable().optional(),
    newDeliveryTime: z.string(),
    newFireAt: z.string(),
});

// 5. Menu Updated
export const zMenuUpdatedEvent = zEventBase.extend({
    eventType: z.literal("menu.updated"),
    // No orderId for global/tenant events
    branchSlug: z.string().optional() // Optional scope
});

export type OrderCreatedEvent = z.infer<typeof zOrderCreatedEvent>;
export type OrderPaidEvent = z.infer<typeof zOrderPaidEvent>;
export type OrderRefundedEvent = z.infer<typeof zOrderRefundedEvent>;
export type OrderChargebackEvent = z.infer<typeof zOrderChargebackEvent>;
export type OrderStatusChangedEvent = z.infer<typeof zOrderStatusChangedEvent>;
export type OrderRescheduledEvent = z.infer<typeof zOrderRescheduledEvent>;
export type MenuUpdatedEvent = z.infer<typeof zMenuUpdatedEvent>;
