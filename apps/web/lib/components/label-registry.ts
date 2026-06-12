import { resolveLabelComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, LabelProps, LabelComponent } from "./label-base";
import { labelRegistry, getLabel } from "./label-base";

// Re-export all types and functions from label-base.ts
export type { ComponentSet, LabelProps, LabelComponent };
export { labelRegistry, getLabel };

export interface GetThemedLabelParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Label component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getLabel(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns LabelComponent matching the same type as getLabel()
 */
export function getThemedLabel({
    componentSet,
    tenantOverrideKey,
}: GetThemedLabelParams): LabelComponent {
    return resolveLabelComponent({
        tenantOverrideKey,
        componentSet,
    });
}
