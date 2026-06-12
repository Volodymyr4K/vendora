import { z } from "zod";

/**
 * Stable 403 error response schemas for storefront (AUDIT_6).
 * Declared in one place so clients and route schemas do not drift.
 */

export const zFeatureDisabledResponse = z.object({
    error: z.literal("Feature disabled"),
    code: z.literal("FEATURE_DISABLED")
});
export type FeatureDisabledResponse = z.infer<typeof zFeatureDisabledResponse>;

/** Keep as const so TypeScript does not widen to string. */
export const FEATURE_DISABLED_BODY = {
    error: "Feature disabled",
    code: "FEATURE_DISABLED"
} as const satisfies FeatureDisabledResponse;

export const zScheduledOrderingDisabledResponse = z.object({
    error: z.literal("Scheduled ordering disabled for this branch"),
    code: z.literal("SCHEDULED_ORDERING_DISABLED")
});
export type ScheduledOrderingDisabledResponse = z.infer<typeof zScheduledOrderingDisabledResponse>;

/** Keep as const so TypeScript does not widen to string. */
export const SCHEDULED_ORDERING_DISABLED_BODY = {
    error: "Scheduled ordering disabled for this branch",
    code: "SCHEDULED_ORDERING_DISABLED"
} as const satisfies ScheduledOrderingDisabledResponse;

export const zTenantMismatchResponse = z.object({
    error: z.literal("Tenant mismatch")
});
export type TenantMismatchResponse = z.infer<typeof zTenantMismatchResponse>;

/** Keep as const so TypeScript does not widen to string. */
export const TENANT_MISMATCH_BODY = {
    error: "Tenant mismatch"
} as const satisfies TenantMismatchResponse;

/** 403 for checkout/init and checkout/confirm: FEATURE_DISABLED | SCHEDULED_ORDERING_DISABLED | TENANT_MISMATCH. Any new 403 must extend this union. */
export const zCheckout403Response = z.union([
    zFeatureDisabledResponse,
    zScheduledOrderingDisabledResponse,
    zTenantMismatchResponse
]);
