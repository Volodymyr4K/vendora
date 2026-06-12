import { z } from "zod";
import { isValidTimezone } from "@vendora/shared";
import { zTenantFeaturesUpdate } from "@vendora/contracts";

export const TenantCreateSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    adminEmail: z.string().email("Invalid email address"),
    adminPassword: z.string().min(6, "Password must be at least 6 characters"),
    countryCode: z.string().min(2).max(2).default("UA"),
    currency: z.string().min(3).max(3).default("UAH"),
    timezone: z.string()
        .default("Europe/Kiev")
        .refine(isValidTimezone, {
            message: "Invalid IANA timezone identifier (e.g., 'Europe/Kiev', 'America/New_York')"
        }),
});

export const TenantUpdateSchema = z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    isActive: z.boolean().optional(),
    countryCode: z.string().min(2).max(2).optional(),
    currency: z.string().min(3).max(3).optional(),
    timezone: z.string()
        .optional()
        .refine((val) => !val || isValidTimezone(val), {
            message: "Invalid IANA timezone identifier (e.g., 'Europe/Kiev', 'America/New_York')"
        }),
    features: zTenantFeaturesUpdate.optional(),
});

export const BranchCreateSchema = z.object({
    name: z.string().min(2, "Name must be at least 2 characters"),
    slug: z.string().min(2, "Slug must be at least 2 characters").regex(/^[a-z0-9-]+$/, "Slug must contain only lowercase letters, numbers, and hyphens"),
    cityName: z.string().min(2, "City name must be at least 2 characters"),
    address: z.string().optional(),
    phone: z.string().optional(),
});

export const BranchUpdateSchema = z.object({
    name: z.string().min(2).optional(),
    slug: z.string().min(2).regex(/^[a-z0-9-]+$/).optional(),
    cityName: z.string().min(2).optional(),
    address: z.string().optional(),
    phones: z.array(z.string()).optional(),
});

// Infer types
export type TenantCreateInput = z.infer<typeof TenantCreateSchema>;
export type TenantUpdateInput = z.infer<typeof TenantUpdateSchema>;
export type BranchCreateInput = z.infer<typeof BranchCreateSchema>;
export type BranchUpdateInput = z.infer<typeof BranchUpdateSchema>;
