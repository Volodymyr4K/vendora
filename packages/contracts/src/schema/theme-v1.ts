/**
 * Theme V1 — design tokens per tenant (AUDIT 3.1, 3.3, 3.5).
 * Single source of truth for ThemeV1 (input) and ResolvedTheme (BFF output).
 * themeSource is not in API (diagnostics only via BFF logs).
 */

import { z } from "zod";

// ============================================
// CONSTANTS (audit 3.1)
// ============================================

export const THEME_V1_PRESETS = ["default", "warm", "cool", "minimal"] as const;
export type ThemeV1Preset = (typeof THEME_V1_PRESETS)[number];

export const THEME_V1_TOKEN_KEYS = [
  "bg",
  "paper",
  "ink",
  "muted",
  "line",
  "accent",
  "accentWeak",
  "footerBg",
  "radius",
  "shadow",
] as const;
export type ThemeV1TokenKey = (typeof THEME_V1_TOKEN_KEYS)[number];

export const THEME_V1_SHADOW_PRESETS = ["none", "soft", "hard"] as const;
export type ThemeV1ShadowPreset = (typeof THEME_V1_SHADOW_PRESETS)[number];

/** Max lengths per audit 3.1 */
export const THEME_V1_MAX = {
  HEX: 9, // #RRGGBBAA
  RADIUS: 16,
  SHADOW_STRING: 64,
  URL: 2048,
  FONTFAMILY: 256,
  ALT: 256,
} as const;

/** 16KB total theme size (canonicalized); enforcement at BFF write/normalize */
export const THEME_MAX_JSON_BYTES = 16 * 1024;

// ============================================
// PRIMITIVES
// ============================================

/** Hex color: #RGB, #RRGGBB, #RRGGBBAA — max 9 chars */
const zColor = z
  .string()
  .max(THEME_V1_MAX.HEX)
  .regex(/^#[0-9A-Fa-f]{3,8}$/, "Must be hex (#RGB, #RRGGBB, or #RRGGBBAA)");

/** Radius: Npx or Nrem, e.g. 0px, 8px, 0.5rem */
const zRadius = z
  .string()
  .max(THEME_V1_MAX.RADIUS)
  .regex(/^\d+(\.\d+)?(px|rem)$/, "Must be Npx or Nrem");

/** CSS color: Hex OR rgba() string (for transparency) */
const zCssColor = zColor.or(
  z.string()
    .max(64)
    .regex(/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*[\d.]+\s*\)$/, "Must be #Hex or rgba(...)")
);

/** Shadow in ThemeV1 input: allowlist preset */
const zShadowPreset = z.enum(THEME_V1_SHADOW_PRESETS);

/** Brand URL — max length; full validation (https, no ip-literals, no private IP) at BFF */
const zBrandUrl = z.string().max(THEME_V1_MAX.URL).optional();
const zFontFamily = z.string().max(THEME_V1_MAX.FONTFAMILY).optional();
const zAlt = z.string().max(THEME_V1_MAX.ALT).optional();

// ============================================
// THEME V1 (input / DB)
// ============================================

const zThemeV1Brand = z
  .object({
    logoUrl: zBrandUrl,
    faviconUrl: zBrandUrl,
    fontFamily: zFontFamily,
    logoAlt: zAlt,
    alt: zAlt,
    fontUrl: zBrandUrl,
    ogImage: zBrandUrl,
  })
  .strict()
  .optional();

/** Tokens in ThemeV1: overrides only; allowlist keys, strict */
const zThemeV1Tokens = z
  .object({
    bg: zColor.optional(),
    paper: zColor.optional(),
    ink: zColor.optional(),
    muted: zColor.optional(),
    line: zColor.optional(),
    accent: zColor.optional(),
    accentWeak: zCssColor.optional(),
    footerBg: zColor.optional(),
    radius: zRadius.optional(),
    shadow: zShadowPreset.optional(),

    // NEW (Phase 6): Typography overrides (strings)
    fontFamily: zFontFamily,
    fontSizeBase: z.string().max(32).optional(),
    fontSizeSmall: z.string().max(32).optional(),
    fontSizeLarge: z.string().max(32).optional(),

    // NEW (Phase 6): Spacing & Borders
    spaceXs: z.string().max(32).optional(),
    spaceS: z.string().max(32).optional(),
    spaceM: z.string().max(32).optional(),
    spaceL: z.string().max(32).optional(),
    spaceXl: z.string().max(32).optional(),

    borderWidthThin: z.string().max(32).optional(),
    borderWidthThick: z.string().max(32).optional(),

    // NEW (Phase 6): States
    focusRingColor: zCssColor.optional(),
    focusRingWidth: z.string().max(32).optional(),

    // NEW (Phase 6): Transparent RGB override (optional)
    accentRgb: z.string().max(32).optional(),

    // Semantic status colors (optional)
    success: zColor.optional(),
    warning: zColor.optional(),
    danger: zColor.optional(),
    info: zColor.optional(),
  })
  .strict()
  .optional();

export const zThemeV1 = z
  .object({
    version: z.literal(1),
    preset: z.enum(THEME_V1_PRESETS).optional(),
    tokens: zThemeV1Tokens,
    layoutPreset: z.enum(["default", "minimal", "sidebar", "grid", "full"]).optional(),
    componentSet: z.enum(["default", "minimal", "acme"]).optional(),
    brand: zThemeV1Brand,
  })
  .strict();

export type ThemeV1 = z.infer<typeof zThemeV1>;

// ============================================
// THEME V1 PATCH (Phase 7: Secure Partial Updates)
// ============================================

/** 
 * Strict Patch Schema for Tokens: NO defaults, all fields optional.
 * Manually defined to ensure defaults from zThemeV1Tokens don't leak in.
 */
const zThemeV1TokensPatch = z.object({
  bg: zColor.optional(),
  paper: zColor.optional(),
  ink: zColor.optional(),
  muted: zColor.optional(),
  line: zColor.optional(),
  accent: zColor.optional(),
  accentWeak: zCssColor.optional(),
  footerBg: zColor.optional(),
  radius: zRadius.optional(),
  shadow: zShadowPreset.optional(),

  // Extended Tokens
  fontFamily: zFontFamily, // already optional in base
  fontSizeBase: z.string().max(32).optional(),
  fontSizeSmall: z.string().max(32).optional(),
  fontSizeLarge: z.string().max(32).optional(),

  spaceXs: z.string().max(32).optional(),
  spaceS: z.string().max(32).optional(),
  spaceM: z.string().max(32).optional(),
  spaceL: z.string().max(32).optional(),
  spaceXl: z.string().max(32).optional(),

  borderWidthThin: z.string().max(32).optional(),
  borderWidthThick: z.string().max(32).optional(),

  focusRingColor: zCssColor.optional(),
  focusRingWidth: z.string().max(32).optional(),

  // Validated RGB format: "R G B" (e.g. "255 0 128") with 0-255 range check
  accentRgb: z.string()
    .regex(/^\d{1,3}\s+\d{1,3}\s+\d{1,3}$/, "Must be 'R G B'")
    .refine(val => val.split(/\s+/).every(n => {
      const p = parseInt(n, 10);
      return !isNaN(p) && p >= 0 && p <= 255;
    }), "Colors must be 0-255")
    .optional(),

  // Semantic status colors (optional)
  success: zColor.optional(),
  warning: zColor.optional(),
  danger: zColor.optional(),
  info: zColor.optional(),
}).strict();

/** 
 * Strict Patch Schema for Brand: NO defaults, all fields optional.
 */
const zThemeV1BrandPatch = z.object({
  logoUrl: zBrandUrl.optional(),
  faviconUrl: zBrandUrl.optional(),
  fontFamily: zFontFamily.optional(),
  logoAlt: zAlt.optional(),
  alt: zAlt.optional(),
  fontUrl: zBrandUrl.optional(),
  ogImage: zBrandUrl.optional(),
}).strict();

export const zThemeV1Patch = z.object({
  preset: z.enum(THEME_V1_PRESETS).optional(),
  layoutPreset: z.enum(["default", "minimal", "sidebar", "grid", "full"]).optional(),
  tokens: zThemeV1TokensPatch.optional(), // Safe: no defaults inside
  brand: zThemeV1BrandPatch.optional(),     // Safe: no defaults inside
}); // version is EXCLUDED

export type ThemeV1Patch = z.infer<typeof zThemeV1Patch>;


// ============================================
// RESOLVED THEME (BFF output — all tokens filled)
// ============================================

/** ResolvedTheme.tokens — all keys required (filled by BFF from preset + overrides + defaults) */
const zResolvedThemeTokens = z.object({
  bg: z.string().min(1).max(THEME_V1_MAX.HEX),
  paper: z.string().min(1).max(THEME_V1_MAX.HEX),
  ink: z.string().min(1).max(THEME_V1_MAX.HEX),
  muted: z.string().min(1).max(THEME_V1_MAX.HEX),
  line: z.string().min(1).max(THEME_V1_MAX.HEX),
  accent: z.string().min(1).max(THEME_V1_MAX.HEX),
  accentWeak: z.string().min(1).max(64), // Hex or Rgba
  footerBg: z.string().min(1).max(THEME_V1_MAX.HEX),
  radius: z.string().min(1).max(THEME_V1_MAX.RADIUS),
  /** BFF maps preset to actual CSS shadow string; can be longer than preset name */
  shadow: z.string().min(1).max(256),

  // NEW (Phase 6): Derived / Extended
  accentRgb: z.string().min(1).max(32).optional(), // Optional in contract, guaranteed logic in Web

  fontFamily: z.string().min(1).max(THEME_V1_MAX.FONTFAMILY),
  fontSizeBase: z.string().min(1).max(32),
  fontSizeSmall: z.string().min(1).max(32),
  fontSizeLarge: z.string().min(1).max(32),
  lineHeightBase: z.string().min(1).max(32),
  fontWeightNormal: z.number(),
  fontWeightBold: z.number(),
  fontWeightBlack: z.number(),

  spaceXs: z.string().min(1).max(32),
  spaceS: z.string().min(1).max(32),
  spaceM: z.string().min(1).max(32),
  spaceL: z.string().min(1).max(32),
  spaceXl: z.string().min(1).max(32),

  borderWidthThin: z.string().min(1).max(32),
  borderWidthThick: z.string().min(1).max(32),

  focusRingColor: z.string().min(1).max(64),
  focusRingWidth: z.string().min(1).max(32),

  // Semantic status colors (optional)
  success: zColor.optional(),
  warning: zColor.optional(),
  danger: zColor.optional(),
  info: zColor.optional(),
});

/** Brand block in ResolvedTheme (optional; same shape as ThemeV1 brand) */
const zResolvedThemeBrand = zThemeV1Brand;

export const zResolvedTheme = z.object({
  tokens: zResolvedThemeTokens,
  brand: zResolvedThemeBrand,
  layoutPreset: z.enum(["default", "minimal", "sidebar", "grid", "full"]).default("default"),
  componentSet: z.enum(["default", "minimal", "acme"]).default("default"),
});

export type ResolvedTheme = z.infer<typeof zResolvedTheme>;
