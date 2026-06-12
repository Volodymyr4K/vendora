/**
 * Types for component overrides registry system.
 * Variant B: Component-level overrides with tenant-specific customization.
 */

import type { ResolvedTheme } from "@vendora/contracts";

/**
 * Component identifier (e.g., "Button", "Card", "Input").
 */
export type ComponentId = "Button" | "Card" | "Input" | "Select" | "Textarea" | "Label" | "Checkbox" | "Badge" | "Radio" | "Topbar";

/**
 * Component variant identifier (e.g., "primary", "secondary", "default").
 */
export type ComponentVariant = string;

/**
 * Component set identifier (matches ResolvedTheme.componentSet).
 */
export type ComponentSet = ResolvedTheme["componentSet"];

/**
 * Tenant override key for tenant-specific overrides.
 * null/undefined means no tenant-specific override.
 */
export type TenantOverrideKey = string | null | undefined;

/**
 * Generic resolver function signature.
 * Resolves a component based on tenant override key, component set, and variant.
 */
export type ComponentResolver<T> = (params: {
    tenantOverrideKey?: TenantOverrideKey;
    componentSet: ComponentSet;
    variant?: ComponentVariant;
}) => T;
