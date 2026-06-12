import { z } from "zod";

// ==========================================
// 1. PRIMITIVES
// ==========================================

// Strict E.164 Validator
// We DO NOT transform input here. Frontend must provide valid E.164.
// Accepted: +38063..., +49..., +1...
export const zCustomerPhoneInput = z.string().regex(/^\+[1-9]\d{1,14}$/, "Invalid format. Expected international format (e.g. +380...)");

// ==========================================
// 2. AUTH CONTRACTS
// ==========================================

export const zCustomerLoginRequest = z.object({
    phone: zCustomerPhoneInput,
});

export const zCustomerVerifyRequest = z.object({
    phone: zCustomerPhoneInput,
    code: z.string().length(4, "The code must contain 4 digits"),
});

export const zCustomerAuthResponse = z.object({
    token: z.string(),
    customer: z.object({
        id: z.string(),
        phone: z.string(),
        name: z.string().nullable(),
    })
});

// ==========================================
// 3. PROFILE & ADDRESS
// ==========================================

export const zCustomerAddressCreate = z.object({
    city: z.string().min(1, "City is required"),
    street: z.string().min(1, "Street is required"),
    house: z.string().min(1, "House number is required"),
    flat: z.string().optional(),
    entrance: z.string().optional(),
    floor: z.string().optional(),
    code: z.string().optional(),
    comment: z.string().optional(),
    label: z.string().optional(), // 'Home', 'Work'
    lat: z.number().optional(),
    lng: z.number().optional()
});

export const zCustomerAddressResponse = zCustomerAddressCreate.extend({
    id: z.string(),
    createdAt: z.string() // ISO
});

// Deprecated or Legacy used in previous mock (Optional keep for compat if needed, otherwise rely on Create/Response)
export const zCustomerAddress = zCustomerAddressCreate.extend({
    id: z.string().optional()
});

export const zCustomerProfile = z.object({
    id: z.string(),
    phone: z.string(),
    name: z.string().nullable(),
    email: z.string().nullable(),
    lastVisitedBranchSlug: z.string().nullable(),
    addresses: z.array(zCustomerAddressResponse),
});

export const zCustomerUpdateProfile = z.object({
    name: z.string().min(2).optional(),
    email: z.string().email().optional(),
});

// ==========================================
// 4. ORDER HISTORY
// ==========================================

export const zCustomerOrderHistoryItem = z.object({
    id: z.string(),
    orderId: z.string(),
    branchSlug: z.string(),
    status: z.enum(["created", "pending", "paid", "confirmed", "done", "cancelled"]),
    total: z.number(), // cents
    createdAt: z.string(),
    itemsSummary: z.string() // e.g. "Pizza Carbonara x2, Cola..."
});

export const zCustomerOrderHistoryResponse = z.object({
    orders: z.array(zCustomerOrderHistoryItem),
    nextCursor: z.string().nullable()
});

// ==========================================
// 5. MARKETING & ENGAGEMENT
// ==========================================

export const zCustomerFavorite = z.object({
    customerId: z.string(),
    productId: z.string(),
    createdAt: z.string() // ISO
});

export const zCustomerFavoriteResponse = z.object({
    favorites: z.array(zCustomerFavorite),
});

export const zReorderResponse = z.object({
    cart: z.object({
        items: z.array(z.object({
            id: z.string(),
            qty: z.number(),
            title: z.string(),
            price: z.number()
        })),
    }),
    warnings: z.array(z.string()).optional(), // e.g. "Price changed for Pizza"
});

export const zCustomerAddressDeleteResponse = z.object({
    success: z.boolean()
});

export type CustomerFavorite = z.infer<typeof zCustomerFavorite>;
export type CustomerFavoriteResponse = z.infer<typeof zCustomerFavoriteResponse>;
export type ReorderResponseDTO = z.infer<typeof zReorderResponse>;
export type CustomerAddressDeleteResponse = z.infer<typeof zCustomerAddressDeleteResponse>;

