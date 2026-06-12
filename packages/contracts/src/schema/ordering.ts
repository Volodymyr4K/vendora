import { z } from "zod";

// --- SELF-CONTAINED SCHEMAS (No Import from index.ts) ---

/** CartItemRef — minimal cart line (id + qty) */
export const zCartItemRef = z.object({
    id: z.string().min(1),
    qty: z.coerce.number().int().positive(),
});

// Strict phone for input (Creation/Checkout)
export const zPhone = z.string().regex(/^\+?380\d{9}$/, "Invalid format. Expected +380...");

// Resilient phone for output (Admin/Views)
export const zPhoneResilient = z.preprocess((val) => {
    if (typeof val !== 'string') return "+380000000000";
    const digits = val.replace(/\D/g, '');
    if (digits.startsWith("380") && digits.length === 12) return `+${digits}`;
    if (digits.length === 10 && digits.startsWith("0")) return `+38${digits}`;
    return "+380000000000";
}, z.string().regex(/^\+?380\d{9}$/));

export const zOrderCustomer = z.object({
    name: z.string().min(1).optional(),
    phone: zPhone, // Strict format again
});

export const zOrderCustomerResilient = z.object({
    name: z.string().min(1).optional(),
    phone: zPhoneResilient,
});

export const zOrderDelivery = z.object({
    method: z.enum(["delivery", "pickup"]).default("delivery"),
    address: z.string().min(5).optional(),
    comment: z.string().max(300).optional(),
});

export const zOrderPayment = z.object({
    method: z.enum(["cash", "card_on_delivery", "online"]).default("cash"),
});

// Legacy Quote Schemas needed by BFF
export const zQuoteLine = z.object({
    id: z.string().min(1),
    name: z.string().min(1),
    qty: z.number().int().positive(),
    unitPrice: z.number().nonnegative(),
    lineTotal: z.number().nonnegative(),
});

export const zQuoteRequest = z.object({
    branchSlug: z.string().min(1),
    items: z.array(zCartItemRef).min(1),
});

export const zQuoteResponse = z.object({
    mode: z.enum(["ok", "fallback"]).default("ok"),
    message: z.string().optional(),
    currency: z.string().default("UAH"),
    branchSlug: z.string().min(1),
    lines: z.array(zQuoteLine),
    subtotal: z.number().nonnegative(),
    deliveryFee: z.number().nonnegative(),
    freeFrom: z.number().nonnegative().optional(),
    total: z.number().nonnegative(),
    etaMin: z.number().int().positive().optional(),
    etaMax: z.number().int().positive().optional(),
});


export const zOrderCreateRequest = z.object({
    branchSlug: z.string().min(1),
    items: z.array(zCartItemRef).min(1),
    customer: zOrderCustomer,
    delivery: zOrderDelivery,
    payment: zOrderPayment,
    meta: z.record(z.string(), z.string()).optional(),
});

export const zOrderStatus = z.enum(["created", "pending", "paid", "confirmed", "cancelled", "done"]);

export const zOrderCreateResponse = z.object({
    token: z.string().min(10),
    orderId: z.string().min(1),
    status: zOrderStatus,
    paymentUrl: z.string().optional(),
    createdAt: z.string().min(10), // ISO
});

export const zOrderStatusResponse = z.object({
    token: z.string().min(10),
    orderId: z.string().min(1),
    status: zOrderStatus,
    updatedAt: z.string().min(10), // ISO
    message: z.string().optional(),
});

export const zOrderSummary = z.object({
    token: z.string(),
    orderId: z.string(),
    status: zOrderStatus,
    total: z.number(),
    customer: z.object({
        name: z.string(),
        phone: zPhoneResilient, // Use resilient schema
    }),
    createdAt: z.string(),
    updatedAt: z.string(),
});

export const zUpdateOrderStatus = z.object({
    status: zOrderStatus,
});

export const zCreateProductSchema = z.object({
    title: z.string().min(2),
    categoryId: z.string(),
    price: z.number().positive(),
    desc: z.string().nullish().transform(val => val ?? ''),
    weightG: z.number().optional(),
    imageUrl: z.string().optional(),
});

export const zOrderListResponse = z.array(zOrderSummary);

// --- NEW V2: SMART CHECKOUT SCHEMAS ---

export const zCheckoutDelivery = z.object({
    method: z.enum(["delivery", "pickup"]).default("delivery"),

    // Variant A: Select existing address
    addressId: z.string().uuid().optional(),

    // Variant B: New Address Structure
    newAddress: z.object({
        city: z.string().min(2),
        street: z.string().min(2),
        house: z.string().min(1),
        flat: z.string().optional(),
        label: z.string().optional(),
    }).optional(),
});

// Step 1: Init
export const zCheckoutInitRequest = z.object({
    branchSlug: z.string().min(1),
    items: z.array(zCartItemRef).min(1),

    customer: z.object({
        name: z.string().optional(),
        phone: zPhone,
    }),

    delivery: zCheckoutDelivery,
    payment: zOrderPayment,

    saveToAddressBook: z.boolean().default(false),

    // Extra Fields
    personCount: z.number().int().min(1).default(1),
    comment: z.string().max(500).optional(),

    // Scheduled delivery time
    requestedDeliveryTime: z
        .string()
        .datetime({ offset: true })
        .optional(),
});

export const zCheckoutInitResponse = z.object({
    success: z.boolean(),
    ttl: z.number(),
    message: z.string().optional(),
});

// Step 2: Confirm
export const zCheckoutConfirmRequest = z.object({
    phone: zPhone,
    otp: z.string().length(4), // 4 digit code
});

export const zCheckoutConfirmResponse = z.object({
    success: z.boolean(),
    orderId: z.string(),
    token: z.string(),
    user: z.object({
        name: z.string().nullable(),
        email: z.string().nullable(),
        phone: z.string(),
    }).optional(),
});


export const zRescheduleOrderRequest = z.object({
    newDeliveryTime: z.string().datetime(),
});

// EXPORT TYPES
export type CartItemRef = z.infer<typeof zCartItemRef>;
export type OrderCustomer = z.infer<typeof zOrderCustomer>;
export type OrderDelivery = z.infer<typeof zOrderDelivery>;
export type OrderPayment = z.infer<typeof zOrderPayment>;
export type OrderCreateRequest = z.infer<typeof zOrderCreateRequest>;
export type OrderCreateResponse = z.infer<typeof zOrderCreateResponse>;
export type OrderStatusResponse = z.infer<typeof zOrderStatusResponse>;
export type OrderSummary = z.infer<typeof zOrderSummary>;
export type OrderListResponse = z.infer<typeof zOrderListResponse>;
export type CreateProductRequest = z.infer<typeof zCreateProductSchema>;
export type QuoteRequest = z.infer<typeof zQuoteRequest>;
export type QuoteResponse = z.infer<typeof zQuoteResponse>;

export type CheckoutInitRequest = z.infer<typeof zCheckoutInitRequest>;
export type CheckoutInitResponse = z.infer<typeof zCheckoutInitResponse>;
export type CheckoutConfirmRequest = z.infer<typeof zCheckoutConfirmRequest>;
export type CheckoutConfirmResponse = z.infer<typeof zCheckoutConfirmResponse>;
export type RescheduleOrderRequest = z.infer<typeof zRescheduleOrderRequest>;

