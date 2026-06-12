import { resolveButtonComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import type { ComponentSet, ButtonBase, ButtonAsButtonProps, ButtonAsLinkProps, ButtonProps, ButtonComponent } from "./button-base";
import { buttonRegistry, getButton } from "./button-base";

// Re-export all types and functions from button-base.ts
export type { ComponentSet, ButtonBase, ButtonAsButtonProps, ButtonAsLinkProps, ButtonProps, ButtonComponent };
export { buttonRegistry, getButton };

export interface GetThemedButtonParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Button component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getButton(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns ButtonComponent matching the same type as getButton()
 */
export function getThemedButton({
    componentSet,
    tenantOverrideKey,
}: GetThemedButtonParams): ButtonComponent {
    return resolveButtonComponent({
        tenantOverrideKey,
        componentSet,
    });
}
