import { resolveRadioComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, RadioProps, RadioComponent } from "./radio-base";
import { radioRegistry, getRadio } from "./radio-base";

// Re-export all types and functions from radio-base.ts
export type { ComponentSet, RadioProps, RadioComponent };
export { radioRegistry, getRadio };

export interface GetThemedRadioParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Radio component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getRadio(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns RadioComponent matching the same type as getRadio()
 */
export function getThemedRadio({
    componentSet,
    tenantOverrideKey,
}: GetThemedRadioParams): RadioComponent {
    return resolveRadioComponent({
        tenantOverrideKey,
        componentSet,
    });
}
