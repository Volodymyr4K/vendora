/**
 * Shared data mappers for BFF layer
 * Single Source of Truth for transforming DB models to API responses
 */

import type { CatalogItem, Category, Branch, Tenant } from "@vendora/database";
import { moneyFromMinor } from "./money.js";
import { zWorkingSchedule } from "@vendora/contracts";

/**
 * Transform DB Category to API MenuCategory
 */
export function mapCategory(category: Category) {
    return {
        id: category.id,
        slug: category.slug,
        title: category.title
    };
}

/**
 * Transform DB CatalogItem to API MenuItem (Phase 1.3)
 * basePriceCents → price (major units); status ACTIVE → isAvailable true
 */
export function mapCatalogItemToMenuItem(
    item: CatalogItem & { category?: Category | null }
) {
    return {
        id: item.id,
        slug: item.slug,
        title: item.title,
        price: moneyFromMinor(item.basePriceCents ?? 0),
        imageUrl: item.imageUrl,
        desc: item.desc,
        weightG: item.weightG,
        categorySlug: item.category ? item.category.slug : "uncategorized",
        categoryId: item.categoryId,
        isAvailable: item.status === "ACTIVE"
    };
}

/** @deprecated Use mapCatalogItemToMenuItem */
export const mapProductToMenuItem = mapCatalogItemToMenuItem;

/**
 * Type-safe input for mapBranchToPublic
 * 
 * IMPORTANT: When calling this mapper, ensure your Prisma query includes ALL these fields.
 * Using Pick ensures we have exactly the fields needed, preventing runtime undefined errors.
 */
type MapperBranchInput = Pick<
    Branch,
    | 'slug'
    | 'cityName'
    | 'address'
    | 'phones'
    | 'deliveryFee'
    | 'freeFrom'
    | 'etaMin'
    | 'etaMax'
    | 'zones'
    | 'isActive'
    | 'workingSchedule'
> & {
    /** Optional tenant relation (from Prisma include) */
    tenant?: Pick<Tenant, 'features'> | null;
};

/**
 * Transform DB Branch to API BranchConfig
 * Ensures money fields are converted to valid Units (UAH)
 * 
 * PHASE 10: Now accepts branch.tenant from includes for better performance
 * 
 * @param branch - Branch data with required fields (use MapperBranchInput type)
 * @param tenant - Optional fallback tenant (for backward compatibility)
 */
export function mapBranchToPublic(
    branch: MapperBranchInput,
    tenant?: Pick<Tenant, 'features'> | null
) {
    return {
        slug: branch.slug,
        cityName: branch.cityName,
        address: branch.address,
        phones: branch.phones,
        deliveryFee: moneyFromMinor(branch.deliveryFee),
        freeFrom: moneyFromMinor(branch.freeFrom),
        etaMin: branch.etaMin,
        etaMax: branch.etaMax,
        zones: branch.zones,
        isActive: branch.isActive,
        workingSchedule: branch.workingSchedule == null
            ? undefined
            : zWorkingSchedule.parse(branch.workingSchedule),
        // Public subset only (version + modules); do not expose limits/integrations/capabilities
        features: (() => {
            const f = branch.tenant?.features ?? tenant?.features;
            if (!f || typeof f !== 'object') return undefined;
            const mod = (f as { modules?: unknown }).modules;
            const ver = (f as { version?: number }).version;
            return mod != null ? { version: ver, modules: mod } : undefined;
        })(),
    };
}
