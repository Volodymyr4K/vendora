import { resolveTextareaComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, TextareaProps, TextareaComponent } from "./textarea-base";
import { textareaRegistry, getTextarea } from "./textarea-base";

// Re-export all types and functions from textarea-base.ts
export type { ComponentSet, TextareaProps, TextareaComponent };
export { textareaRegistry, getTextarea };

export interface GetThemedTextareaParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Textarea component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getTextarea(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns TextareaComponent matching the same type as getTextarea()
 */
export function getThemedTextarea({
    componentSet,
    tenantOverrideKey,
}: GetThemedTextareaParams): TextareaComponent {
    return resolveTextareaComponent({
        tenantOverrideKey,
        componentSet,
    });
}
