import type { TenantFeatures, StorefrontFeatures } from "@vendora/contracts";

/** Storefront config/branch expose only StorefrontFeatures (version + modules); super-admin uses full TenantFeatures. */
type FeaturesWithModules = StorefrontFeatures | TenantFeatures | null | undefined;

/**
 * Check if a feature is enabled with defensive defaults and fallback logic.
 * 
 * This helper encapsulates the defensive programming pattern:
 * 1. Check granular flag first
 * 2. Fallback to master flag if granular is undefined
 * 3. Default to `true` if both are undefined (backward compatibility)
 * 
 * @param features - Storefront features (version + modules) or full tenant features (can be null/undefined)
 * @param granularFlag - Specific feature flag to check (e.g., 'scheduledOrdering')
 * @param masterFlag - Master category flag to fallback to (e.g., 'ordering')
 * @returns true if feature is enabled, false otherwise
 * 
 * @example
 * ```typescript
 * // Check if time slots should be shown:
 * const showTimeSlots = isFeatureEnabled(
 *   cfg.features, 
 *   'scheduledOrdering', 
 *   'ordering'
 * );
 * ```
 */
export function isFeatureEnabled(
    features: FeaturesWithModules,
    granularFlag: keyof TenantFeatures['modules'],
    masterFlag: keyof TenantFeatures['modules']
): boolean {
    // Triple fallback for maximum safety:
    // 1. Try granular flag
    // 2. Fallback to master flag
    // 3. Default to true (backward compatible)
    return features?.modules?.[granularFlag]
        ?? features?.modules?.[masterFlag]
        ?? true;
}

/**
 * Check if a top-level master feature is enabled.
 * 
 * Use this for master switches (profile, ordering, delivery).
 * 
 * @param features - Tenant features object
 * @param masterFlag - Master flag name
 * @returns true if master feature is enabled
 * 
 * @example
 * ```typescript
 * const isProfileEnabled = isMasterFeatureEnabled(cfg.features, 'profile');
 * if (!isProfileEnabled) notFound();
 * ```
 */
export function isMasterFeatureEnabled(
    features: FeaturesWithModules,
    masterFlag: 'profile' | 'ordering' | 'delivery' | 'menu'
): boolean {
    return features?.modules?.[masterFlag] ?? true;
}
