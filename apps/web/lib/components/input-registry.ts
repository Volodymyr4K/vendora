import { resolveInputComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, InputProps, InputComponent } from "./input-base";
import { inputRegistry, getInput } from "./input-base";

// Re-export all types and functions from input-base.ts
export type { ComponentSet, InputProps, InputComponent };
export { inputRegistry, getInput };

export interface GetThemedInputParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Input component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getInput(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns InputComponent matching the same type as getInput()
 */
export function getThemedInput({
    componentSet,
    tenantOverrideKey,
}: GetThemedInputParams): InputComponent {
    return resolveInputComponent({
        tenantOverrideKey,
        componentSet,
    });
}
