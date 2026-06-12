import { resolveSelectComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, SelectProps, SelectComponent } from "./select-base";
import { selectRegistry, getSelect } from "./select-base";

// Re-export all types and functions from select-base.ts
export type { ComponentSet, SelectProps, SelectComponent };
export { selectRegistry, getSelect };

export interface GetThemedSelectParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Select component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getSelect(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns SelectComponent matching the same type as getSelect()
 */
export function getThemedSelect({
    componentSet,
    tenantOverrideKey,
}: GetThemedSelectParams): SelectComponent {
    return resolveSelectComponent({
        tenantOverrideKey,
        componentSet,
    });
}
