import { resolveCheckboxComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, CheckboxProps, CheckboxComponent } from "./checkbox-base";
import { checkboxRegistry, getCheckbox } from "./checkbox-base";

// Re-export all types and functions from checkbox-base.ts
export type { ComponentSet, CheckboxProps, CheckboxComponent };
export { checkboxRegistry, getCheckbox };

export interface GetThemedCheckboxParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Checkbox component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getCheckbox(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns CheckboxComponent matching the same type as getCheckbox()
 */
export function getThemedCheckbox({
    componentSet,
    tenantOverrideKey,
}: GetThemedCheckboxParams): CheckboxComponent {
    return resolveCheckboxComponent({
        tenantOverrideKey,
        componentSet,
    });
}
