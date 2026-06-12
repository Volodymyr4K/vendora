
import { describe, it, expect } from 'vitest';
import { applyThemePatch } from '../theme-patch.js';
import { ThemeV1 } from '@vendora/contracts';

// Mock minimal valid ThemeV1
const MOCK_THEME: ThemeV1 = {
    version: 1,
    preset: "default",
    tokens: {
        bg: "#ffffff",
        accent: "#000000",
        radius: "4px"
    },
    brand: {},
    layoutPreset: "default",
    componentSet: "default"
};

describe('applyThemePatch', () => {
    it('Deep merge tokens: accent update preserves radius', () => {
        const patch = {
            tokens: { accent: "#ff0000" } // Only update accent
        };

        const result = applyThemePatch(MOCK_THEME, patch);

        expect(result.tokens?.accent).toBe("#ff0000");
        expect(result.tokens?.radius).toBe("4px");
        expect(result.tokens?.bg).toBe("#ffffff");
    });

    it('Deep merge brand: logo update preserves favicon', () => {
        const current = {
            ...MOCK_THEME,
            brand: {
                logoUrl: "https://old.com/logo.png",
                faviconUrl: "https://old.com/fav.png"
            }
        };

        const patch = {
            brand: { logoUrl: "https://new.com/logo.png" }
        };

        const result = applyThemePatch(current, patch);

        expect(result.brand?.logoUrl).toBe("https://new.com/logo.png");
        expect(result.brand?.faviconUrl).toBe("https://old.com/fav.png");
    });

    it('Version cannot be patched', () => {
        // Force patch to contain version (even if type says no, runtime check)
        const patch = {
            version: 2
        } as any;

        const result = applyThemePatch(MOCK_THEME, patch);

        expect(result.version).toBe(1);
    });

    it('Corruption Handling: Patching a fresh/default theme works (fallback scenario)', () => {
        // This simulates what happens when the route encounters invalid DB data and creates a default theme.
        // We ensure applyThemePatch works correctly on this fresh default object.
        const fallbackTheme: ThemeV1 = {
            version: 1,
            preset: "default",
            tokens: {},
            brand: {}
        };

        const patch = {
            tokens: { accent: "#00ff00" }
        };

        const result = applyThemePatch(fallbackTheme, patch);

        expect(result.tokens?.accent).toBe("#00ff00");
        expect(result.preset).toBe("default");
        expect(result.version).toBe(1);
    });
});
