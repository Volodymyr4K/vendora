import type { ResolvedTheme } from "@vendora/contracts";
import type { TenantOverrideKey } from "@/lib/theme/component-overrides/types";
import { resolveTopbarComponent } from "@/lib/theme/component-overrides/resolvers";
import type { TopbarComponent } from "./topbar-base";

// Re-export types and base functions from topbar-base.ts
export type { TopbarProps, TopbarComponent } from "./topbar-base";
export { topbarRegistry, getTopbar } from "./topbar-base";

type ComponentSet = ResolvedTheme["componentSet"];

export interface GetThemedTopbarParams {
    componentSet: ComponentSet;
    tenantOverrideKey?: TenantOverrideKey;
}

/**
 * Get Topbar component with tenant-specific override support.
 * Falls back to componentSet-based selection when no tenant override is provided.
 * 
 * When tenantOverrideKey is null/undefined/empty string, returns EXACTLY the same
 * component as getTopbar(componentSet).
 * 
 * @param params.componentSet - Component set identifier (e.g., "default", "minimal")
 * @param params.tenantOverrideKey - Optional tenant override key for tenant-specific customization
 * @returns TopbarComponent matching the same type as getTopbar()
 */
export function getThemedTopbar({
    componentSet,
    tenantOverrideKey,
}: GetThemedTopbarParams): TopbarComponent {
    return resolveTopbarComponent({
        tenantOverrideKey,
        componentSet,
    });
}
