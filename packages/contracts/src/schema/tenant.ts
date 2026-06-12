import { z } from "zod";
import { zResolvedTheme } from "./theme-v1.js";
import { zAmContentV1 } from "./am-content.js";

// ============================================
// TENANT CAPABILITIES (Phase 1.2)
// ============================================

/** Canonical list of capability keys — single source of truth; unknown key → 4xx on write */
export const TENANT_CAPABILITY_KEYS = [
    "inventory",
    "delivery-slots",
    "modifiers",
    "nutrition",
    "allergens",
    "booking",
    "fitment",
] as const;

export type TenantCapabilityKey = (typeof TENANT_CAPABILITY_KEYS)[number];

const zTenantCapabilityKey = z.enum(TENANT_CAPABILITY_KEYS as unknown as [string, ...string[]]);

/** Validates that all capability keys are from the canonical list */
export const zTenantCapabilities = z.array(zTenantCapabilityKey);

/** Check if tenant features include a capability (type-safe key; use only TenantCapabilityKey to avoid typo) */
export function hasCapability(
    features: { capabilities?: readonly string[] } | null | undefined,
    key: TenantCapabilityKey
): boolean {
    const caps = features?.capabilities;
    return Array.isArray(caps) && caps.includes(key);
}

/**
 * ACCESS_LEVELS: Check if admin module is enabled for tenant (Gate №1). Use AdminModuleId to avoid typo.
 * Semantics: only `true` = enabled; `false` or absent = disabled (map, not set).
 */
export function isAdminModuleEnabled(
    features: { adminModules?: Record<string, boolean> } | null | undefined,
    moduleId: AdminModuleId
): boolean {
    const mods = features?.adminModules;
    if (!mods || typeof mods !== "object") return false;
    return mods[moduleId] === true;
}

// ============================================
// TENANT FEATURE MODULES
// ============================================

/**
 * ACCESS_LEVELS Phase 1.4: Canonical admin module IDs (single source of truth).
 * Super-admin enables/disables these per tenant; used for Gate №1 and UI.
 */
export const ADMIN_MODULE_IDS = [
    "admin_dashboard",
    "admin_orders",
    "admin_users", // ACCESS_LEVELS Phase 5: tenant members, roles, permissions (owner-only)
    "admin_catalog_products",
    "admin_catalog_categories",
    "admin_catalog_menu",
    "admin_catalog_nutrition",
    "admin_catalog_allergens",
    "admin_catalog_option_groups",
    "admin_catalog_offers",
    "admin_catalog_attribute_definitions",
    "admin_catalog_attribute_values",
    "admin_integrations",
    "admin_delivery_config",
    "admin_settings",
    "admin_media",
    "admin_content",
] as const;

export type AdminModuleId = (typeof ADMIN_MODULE_IDS)[number];

/**
 * ACCESS_LEVELS Phase 3.5: Admin modules that support scopeType=BRANCH and branchIds in permissions.
 * Single source of truth for BFF guard and Web users UI; do not duplicate.
 */
export const BRANCH_SCOPED_ADMIN_MODULE_IDS: readonly AdminModuleId[] = [
    "admin_dashboard",
    "admin_orders",
    "admin_catalog_categories",
    "admin_catalog_menu",
    "admin_catalog_products",
    "admin_catalog_nutrition",
    "admin_catalog_allergens",
    "admin_catalog_option_groups",
    "admin_catalog_offers",
    "admin_delivery_config",
    "admin_settings",
];

/**
 * AUDIT 7 fix 12.2: Owner-only admin modules (SSOT). All route entries for these moduleIds in BFF ADMIN_ROUTE_REGISTRY must have ownerOnly: true.
 * Used by Web for menu/canEdit; CI enforces registry invariant.
 */
export const OWNER_ONLY_ADMIN_MODULE_IDS: readonly AdminModuleId[] = ["admin_users"];

/**
 * adminModules = map (moduleId → boolean): false = disabled and stored; PATCH can send false to disable.
 * Not a "set of enabled" — absent key and false both mean disabled; only true = enabled.
 */
const zAdminModules = z
    .record(z.string(), z.boolean())
    .refine(
        (obj) => Object.keys(obj).every((k) => (ADMIN_MODULE_IDS as readonly string[]).includes(k)),
        { message: "adminModules keys must be from canonical ADMIN_MODULE_IDS" }
    )
    .default({});

/**
 * Tenant Feature Modules Schema (Granular)
 * 
 * Phase 8: Expanded to 11 granular feature flags across 3 categories.
 * Top-level flags (profile, ordering, delivery) act as "Master Switches".
 * All flags default to `true` for backward compatibility.
 */
export const zTenantModules = z.object({
    // ============================================
    // MASTER SWITCHES (Top-level, backward compatible)
    // ============================================

    /** Master: Personal Cabinet (when disabled, all profile features disabled) */
    profile: z.boolean().default(true),

    /** Master: Ordering System (when disabled, all ordering features disabled) */
    ordering: z.boolean().default(true),

    /** Master: Delivery Management (when disabled, all delivery features disabled) */
    delivery: z.boolean().default(true),

    /** Catalog / Menu — standalone: show menu (e.g. café without delivery still has menu) */
    menu: z.boolean().default(true),

    // ============================================
    // GRANULAR: Profile & Account Features
    // ============================================

    /** Allow customers to view and edit personal information */
    customerProfiles: z.boolean().default(true),

    /** Show order history and track status */
    orderHistory: z.boolean().default(true),

    /** Manage saved delivery addresses */
    savedAddresses: z.boolean().default(true),

    /** Wishlist / Favorites functionality */
    favorites: z.boolean().default(true),

    // ============================================
    // GRANULAR: Ordering Features
    // ============================================

    /** Cart and checkout functionality */
    cartCheckout: z.boolean().default(true),

    /** Scheduled ordering with time slot selection */
    scheduledOrdering: z.boolean().default(true),

    /** Quick re-order (repeat previous order) */
    quickReorder: z.boolean().default(true),

    // ============================================
    // GRANULAR: Delivery Features
    // ============================================

    /** Basic delivery (zones, fees, ETA) */
    basicDelivery: z.boolean().default(true),
});

/**
 * Tenant Features Schema
 * 
 * Main configuration object stored in `Tenant.features` JSONB column.
 * Matches existing DB schema structure.
 */
export const zTenantFeatures = z.object({
    /** Schema version for future migrations */
    version: z.number().int().default(1),

    /** Feature module toggles (storefront/public) */
    modules: zTenantModules,

    /** ACCESS_LEVELS Phase 1.4: Admin module toggles per tenant (Gate №1). Keys from ADMIN_MODULE_IDS. */
    adminModules: zAdminModules,

    /** Tenant capabilities (enabled feature keys); only keys from TENANT_CAPABILITY_KEYS allowed */
    capabilities: zTenantCapabilities.default([]),

    /** Optional: Future quotas (e.g., maxOrders, maxProducts, maxBranches) */
    limits: z.record(z.string(), z.number()).optional(),

    /** Optional: Future integrations (e.g., payment providers, analytics, telegram) */
    integrations: z.record(z.string(), z.any()).optional(),
});

/**
 * Partial schema for updates (all fields optional)
 * Used in PATCH endpoints to allow partial updates
 */
export const zTenantFeaturesUpdate = z.object({
    version: z.number().int().optional(),
    modules: zTenantModules.partial().optional(),
    adminModules: z
        .record(z.string(), z.boolean())
        .optional()
        .refine(
            (val) =>
                !val ||
                Object.keys(val).every((k) => (ADMIN_MODULE_IDS as readonly string[]).includes(k)),
            { message: "adminModules keys must be from canonical ADMIN_MODULE_IDS" }
        ),
    capabilities: zTenantCapabilities.optional(),
    limits: z.record(z.string(), z.number()).optional(),
    integrations: z.record(z.string(), z.any()).optional(),
});

// ============================================
// EXPORTED TYPES
// ============================================

export type TenantFeatures = z.infer<typeof zTenantFeatures>;
export type TenantModules = z.infer<typeof zTenantModules>;
export type TenantFeaturesUpdate = z.infer<typeof zTenantFeaturesUpdate>;

/** Public subset for storefront (branch/config): only version + modules. Do not expose limits/integrations/capabilities. */
export const zStorefrontFeatures = z.object({
    version: z.number().int().optional(),
    modules: zTenantModules,
});
export type StorefrontFeatures = z.infer<typeof zStorefrontFeatures>;

// ============================================
// MAIN TEMPLATE IDS (Phase 1)
// ============================================

export const MAIN_TEMPLATE_IDS = [
    "default",
    "berlin-press",
] as const;

export type MainTemplateId = (typeof MAIN_TEMPLATE_IDS)[number];

export const zMainTemplateId = z.enum(MAIN_TEMPLATE_IDS);

/** Storefront GET /config response: public subset only (no limits/integrations/capabilities). theme = ResolvedTheme once BFF returns it (1.4). */
export const zStorefrontConfig = z.object({
    countryCode: z.string(),
    currency: z.string(),
    name: z.string(),
    features: zStorefrontFeatures.optional(),
    theme: zResolvedTheme,  // Required: BFF always returns theme (with fallback after Phase 1.8)
    mainTemplate: zMainTemplateId.default("default"),
    amContent: zAmContentV1.optional(),
});

export type StorefrontConfig = z.infer<typeof zStorefrontConfig>;

// ============================================
// DEFAULT VALUES (for convenience)
// ============================================

/** Default features object for new tenants */
export const DEFAULT_TENANT_FEATURES: TenantFeatures = {
    version: 1,
    modules: {
        // Master switches
        profile: true,
        ordering: true,
        delivery: true,
        menu: true,

        // Profile features
        customerProfiles: true,
        orderHistory: true,
        savedAddresses: true,
        favorites: true,

        // Ordering features
        cartCheckout: true,
        scheduledOrdering: true,
        quickReorder: true,

        // Delivery features
        basicDelivery: true,
    },
    adminModules: {},
    capabilities: [],
    limits: {},
    integrations: {},
};


// ============================================
// SUPER ADMIN DTOS
// ============================================

export interface SuperTenantDTO {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    countryCode: string | null;
    currency: string | null;
    timezone: string | null;
    features: TenantFeatures;
    mainTemplate?: MainTemplateId;
    createdAt: string; // ISO Date String
    branchCount: number;
}


export interface SuperBranchDTO {
    id: string;
    slug: string;
    cityName: string;
    address: string | null;
    phones: string[];
    isActive: boolean;
    deliveryFee: number;
    freeFrom: number;
    etaMin: number;
    etaMax: number;
    createdAt: string; // ISO Date String
}

export interface SuperDomainDTO {
    id: string;
    domain: string;
    status: "PENDING" | "VERIFIED" | "FAILED";
    provider: "vercel" | "cloudflare" | "custom" | null;
    isWildcard: boolean;
    txtRecord: string | null;
    cnameTarget: string | null;
    createdAt: string; // ISO Date String
    verifiedAt: string | null;
    lastVerifiedAt: string | null;
}

export interface SuperDomainsResponseDTO {
    domains: SuperDomainDTO[];
}
