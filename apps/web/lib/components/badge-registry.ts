import { resolveBadgeComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, BadgeProps, BadgeComponent } from "./badge-base";
import { badgeRegistry, getBadge } from "./badge-base";

// Re-export all types and functions from badge-base.ts
export type { ComponentSet, BadgeProps, BadgeComponent };
export { badgeRegistry, getBadge };

export interface GetThemedBadgeParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Badge component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getBadge(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns BadgeComponent matching the same type as getBadge()
 */
export function getThemedBadge({
    componentSet,
    tenantOverrideKey,
}: GetThemedBadgeParams): BadgeComponent {
    return resolveBadgeComponent({
        tenantOverrideKey,
        componentSet,
    });
}
