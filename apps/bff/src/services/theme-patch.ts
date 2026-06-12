import { ThemeV1, ThemeV1Patch, zThemeV1 } from "@vendora/contracts";

/**
 * Applies a partial theme patch to the current theme.
 * Performs deep merging for 'tokens' and 'brand' to ensure no data loss.
 * Preserves the 'version' from the current theme (patches cannot change version).
 * Validates the final result against the strict ThemeV1 schema.
 */
export function applyThemePatch(current: ThemeV1, patch: ThemeV1Patch): ThemeV1 {
    // 1. Deep Merge Tokens
    const mergedTokens = {
        ...(current.tokens ?? {}),
        ...(patch.tokens ?? {}),
    };

    // 2. Deep Merge Brand
    // Logic: If patch.brand exists, merge it into current.brand (or empty).
    // If patch.brand is undefined, keep current.brand as is.
    const mergedBrand = patch.brand
        ? { ...(current.brand ?? {}), ...patch.brand }
        : current.brand;

    // 3. Construct Merged Theme
    // Note: 'preset' can be overwritten by patch directly.
    // 'version' comes from CURRENT, ensuring patch cannot downgrade/upgrade unexpectedly.
    const mergedThemeRaw = {
        ...current,
        ...patch,          // Overwrites root fields like 'preset'
        version: current.version, // FORCE preserve version
        tokens: mergedTokens,
        brand: mergedBrand,
    };

    // 4. Validate Final Result
    // This ensures that the merged object is a valid ThemeV1
    // (e.g. if patch introduced partial invalid state that broke consistency, though unlikely with optional fields)
    const finalTheme = zThemeV1.parse(mergedThemeRaw);

    return finalTheme;
}
