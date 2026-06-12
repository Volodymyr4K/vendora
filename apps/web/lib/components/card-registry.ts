import { resolveCardComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, CardComponent, CardProps } from "@/lib/components/card-base";
import { cardRegistry, getCard } from "@/lib/components/card-base";

// Re-export types for backward compatibility
export type { CardProps, CardComponent };
export { cardRegistry, getCard };

export interface GetThemedCardParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Card component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getCard(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns CardComponent matching the same type as getCard()
 */
export function getThemedCard({
    componentSet,
    tenantOverrideKey,
}: GetThemedCardParams): CardComponent {
    return resolveCardComponent({
        tenantOverrideKey,
        componentSet,
    });
}
