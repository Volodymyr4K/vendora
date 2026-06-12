import { z } from 'zod';

/**
 * Order Payload Zod Schemas (Runtime Validation + Type Generation)
 * 
 * CRITICAL: Use z.infer for DRY principle - single source of truth
 * This prevents type drift between DB data and TypeScript types
 * 
 * Usage:
 * ```typescript
 * // Runtime validation (recommended for critical operations)
 * const parseResult = zOrderPayloadComplete.safeParse(order.payload);
 * if (!parseResult.success) {
 *   logger.error('Invalid order payload');
 *   return reply.code(500).send({ error: 'Corrupted order data' });
 * }
 * const payload = parseResult.data; // Fully typed!
 * 
 * // Or type assertion (if you trust the data)
 * const payload = order.payload as OrderPayloadComplete;
 * ```
 */

// Customer schema
export const zOrderPayloadCustomer = z.object({
    name: z.string(),
    phone: z.string()
});

// Delivery info schema
export const zOrderPayloadDeliveryInfo = z.object({
    address: z.string(),
    method: z.enum(['delivery', 'pickup']),
    fee: z.number().nonnegative()
});

// Quote line schema
export const zOrderPayloadQuoteLine = z.object({
    title: z.string(),
    quantity: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    total: z.number().nonnegative()
});

// Quote schema
export const zOrderPayloadQuote = z.object({
    subtotal: z.number().nonnegative(),
    deliveryFee: z.number().nonnegative(),
    total: z.number().nonnegative(),
    lines: z.array(zOrderPayloadQuoteLine)
});

// Item schema
export const zOrderPayloadItem = z.object({
    id: z.string().uuid(),
    title: z.string(),
    quantity: z.number().int().positive(),
    price: z.number().nonnegative()
});

// Complete payload schema
export const zOrderPayloadComplete = z.object({
    customer: zOrderPayloadCustomer,
    delivery: zOrderPayloadDeliveryInfo,
    quote: zOrderPayloadQuote,
    items: z.array(zOrderPayloadItem).optional()
});

// Auto-generated TypeScript types (z.infer magic!)
export type OrderPayloadCustomer = z.infer<typeof zOrderPayloadCustomer>;
export type OrderPayloadDeliveryInfo = z.infer<typeof zOrderPayloadDeliveryInfo>;
export type OrderPayloadQuoteLine = z.infer<typeof zOrderPayloadQuoteLine>;
export type OrderPayloadQuote = z.infer<typeof zOrderPayloadQuote>;
export type OrderPayloadItem = z.infer<typeof zOrderPayloadItem>;
export type OrderPayloadComplete = z.infer<typeof zOrderPayloadComplete>;
