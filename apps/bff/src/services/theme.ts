/**
 * Theme normalization (AUDIT 3.2, 3.9 A–B).
 * canonicalizeHex — single source for all hex from API.
 * normalizeToResolvedTheme — preset + tokens (overrides) + defaults → ResolvedTheme.
 */

import { isIP } from "node:net";
import type { ResolvedTheme, ThemeV1 } from "@vendora/contracts";
import {
  THEME_MAX_JSON_BYTES,
  THEME_V1_PRESETS,
  THEME_V1_SHADOW_PRESETS,
  THEME_V1_TOKEN_KEYS,
  type ThemeV1ShadowPreset,
} from "@vendora/contracts";

// ============================================
// CANONICALIZE HEX (audit 3.2)
// ============================================

const HEX_SHORT_RGB = /^#([0-9A-Fa-f])([0-9A-Fa-f])([0-9A-Fa-f])$/;
const HEX_RGB_OR_RGBA = /^#([0-9A-Fa-f]{6})([0-9A-Fa-f]{2})?$/;

/**
 * Canonical hex: #RGB → #RRGGBB, then lowercase.
 * All API hex must go through this (single function).
 * Invalid input → null (caller uses default).
 */
export function canonicalizeHex(value: string | null | undefined): string | null {
  if (value == null || typeof value !== "string") return null;
  const s = value.trim();
  if (!s.startsWith("#")) return null;
  // Forbid dangerous patterns (audit 3.2)
  if (s.includes("url(") || s.includes(";")) return null;

  const short = HEX_SHORT_RGB.exec(s);
  if (short) {
    const r = short[1]! + short[1];
    const g = short[2]! + short[2];
    const b = short[3]! + short[3];
    return `#${r}${g}${b}`.toLowerCase();
  }

  const long = HEX_RGB_OR_RGBA.exec(s);
  if (long) {
    const base = long[1]!.toLowerCase();
    const alpha = long[2] ? long[2].toLowerCase() : "";
    return alpha ? `#${base}${alpha}` : `#${base}`;
  }

  return null;
}

// ============================================
// SHADOW PRESET → CSS (audit 3.2)
// ============================================

const SHADOW_PRESET_TO_CSS: Record<ThemeV1ShadowPreset, string> = {
  none: "none",
  soft: "0 10px 30px rgba(17,18,20,.10)",
  hard: "0 4px 12px rgba(17,18,20,.15)",
};

// ============================================
// HEX TO RGB STRING (Phase 6.2)
// ============================================

function hexToRgbString(hex: string): string {
  // Robust Hex parsing (RRGGBB or RGB)
  let r = 0, g = 0, b = 0;

  // Strip # if present (though logic usually provides checked hex)
  const cleanHex = hex.replace('#', '');

  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0]! + cleanHex[0]!, 16);
    g = parseInt(cleanHex[1]! + cleanHex[1]!, 16);
    b = parseInt(cleanHex[2]! + cleanHex[2]!, 16);
  } else if (cleanHex.length >= 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  } else {
    // Fallback for invalid hex (safe default orange)
    return "242 166 90";
  }

  // Safety check against NaN (e.g. non-hex chars)
  if (isNaN(r) || isNaN(g) || isNaN(b)) return "242 166 90";

  return `${r} ${g} ${b}`;
}
// ============================================

export const DEFAULT_RESOLVED_THEME: ResolvedTheme = {
  tokens: {
    bg: "#FFFFFF",
    paper: "#F9FAFB",
    ink: "#111827",
    muted: "#6B7280",
    line: "#E5E7EB",
    accent: "#3B82F6",
    accentWeak: "#DBEAFE",
    footerBg: "#111827",
    radius: "8px",
    shadow: "0 2px 4px rgba(0,0,0,0.1)", // Updated default shadow

    // NEW (Phase 6): Extended tokens defaults
    accentRgb: "59 130 246", // Matches default accent #3B82F6

    fontFamily: "ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif",
    fontSizeBase: "16px",
    fontSizeSmall: "13px",
    fontSizeLarge: "18px",
    lineHeightBase: "1.5",
    fontWeightNormal: 400,
    fontWeightBold: 700,
    fontWeightBlack: 900,

    spaceXs: "4px",
    spaceS: "8px",
    spaceM: "12px",
    spaceL: "16px",
    spaceXl: "24px",

    borderWidthThin: "1px",
    borderWidthThick: "2px",

    focusRingColor: "rgba(59,130,246,0.5)", // Matches default accent
    focusRingWidth: "2px",
  },
  brand: {},
  layoutPreset: "default",
  componentSet: "default",
};

// ============================================
// NORMALIZE RADIUS (audit 3.2: Npx | Nrem)
// ============================================

const RADIUS_REGEX = /^\d+(\.\d+)?(px|rem)$/;

function normalizeRadius(value: string | null | undefined): string | null {
  if (value == null || typeof value !== "string") return null;
  const s = value.trim();
  if (s.length > 16) return null;
  if (RADIUS_REGEX.test(s)) return s;
  return null;
}

// ============================================
// NORMALIZE TO RESOLVED THEME
// ============================================

/**
 * Normalize ThemeV1 or null to ResolvedTheme.
 * preset + tokens (as overrides) + defaults; invalid/unknown version → DEFAULT_RESOLVED_THEME.
 * Enforce 16KB on input when applicable (e.g. from API before parse).
 */
export function normalizeToResolvedTheme(
  theme: ThemeV1 | null | undefined
): ResolvedTheme {
  if (theme == null || theme.version !== 1) {
    return DEFAULT_RESOLVED_THEME;
  }

  const base = { ...DEFAULT_RESOLVED_THEME.tokens };
  const overrides = theme.tokens;
  if (overrides) {
    if (overrides.bg != null) {
      const v = canonicalizeHex(overrides.bg);
      if (v) base.bg = v;
    }
    if (overrides.paper != null) {
      const v = canonicalizeHex(overrides.paper);
      if (v) base.paper = v;
    }
    if (overrides.ink != null) {
      const v = canonicalizeHex(overrides.ink);
      if (v) base.ink = v;
    }
    if (overrides.muted != null) {
      const v = canonicalizeHex(overrides.muted);
      if (v) base.muted = v;
    }
    if (overrides.line != null) {
      const v = canonicalizeHex(overrides.line);
      if (v) base.line = v;
    }
    if (overrides.accent != null) {
      const v = canonicalizeHex(overrides.accent);
      if (v) base.accent = v;
    }
    if (overrides.accentWeak != null) {
      const v = canonicalizeHex(overrides.accentWeak);
      if (v) base.accentWeak = v;
    }
    if (overrides.footerBg != null) {
      const v = canonicalizeHex(overrides.footerBg);
      if (v) base.footerBg = v;
    }
    if (overrides.radius != null) {
      const v = normalizeRadius(overrides.radius);
      if (v) base.radius = v;
    }
    if (overrides.shadow != null && THEME_V1_SHADOW_PRESETS.includes(overrides.shadow)) {
      base.shadow = SHADOW_PRESET_TO_CSS[overrides.shadow];
    }

    // NEW (Phase 6): Normalization for extended tokens
    // Pass-through strings (validated at edge/schema, trusting input if present)
    if (overrides.fontFamily) base.fontFamily = overrides.fontFamily;
    if (overrides.fontSizeBase) base.fontSizeBase = overrides.fontSizeBase;
    if (overrides.fontSizeSmall) base.fontSizeSmall = overrides.fontSizeSmall;
    if (overrides.fontSizeLarge) base.fontSizeLarge = overrides.fontSizeLarge;

    if (overrides.spaceXs) base.spaceXs = overrides.spaceXs;
    if (overrides.spaceS) base.spaceS = overrides.spaceS;
    if (overrides.spaceM) base.spaceM = overrides.spaceM;
    if (overrides.spaceL) base.spaceL = overrides.spaceL;
    if (overrides.spaceXl) base.spaceXl = overrides.spaceXl;

    if (overrides.borderWidthThin) base.borderWidthThin = overrides.borderWidthThin;
    if (overrides.borderWidthThick) base.borderWidthThick = overrides.borderWidthThick;

    if (overrides.focusRingColor) base.focusRingColor = overrides.focusRingColor;
    if (overrides.focusRingWidth) base.focusRingWidth = overrides.focusRingWidth;

    // Explicit accentRgb logic (Phase 6.2 Plan)
    if (overrides.accentRgb) {
      // 1. If accentRgb is present -> Keep it
      base.accentRgb = overrides.accentRgb;
    } else {
      // 2. Else If accent is Hex -> Derive RGB from it
      // Note: base.accent is already canonicalized upstream (lines 138-141)
      if (base.accent && base.accent.startsWith('#')) {
        base.accentRgb = hexToRgbString(base.accent);
      } else {
        // 3. Else -> Fallback (should ideally match default accent, using orange fallback for safety)
        base.accentRgb = "242 166 90";
      }
    }
  } else {
    // If no overrides, but we might have changed default accent in CONSTANTS?
    // Here we use DEFAULT_RESOLVED_THEME which is consistent. 
    // But if DEFAULT accent is Hex, we should ensure accentRgb matches.
    // For DEFAULT_RESOLVED_THEME, we hardcoded matching values so it is safe.
  }

  // Type guard for layout preset validation (defensive against manual DB writes)
  type LayoutPreset = "default" | "minimal" | "sidebar" | "grid" | "full";
  const isLayoutPreset = (v: unknown): v is LayoutPreset =>
    v === "default" || v === "minimal" || v === "sidebar" || v === "grid" || v === "full";

  const layoutPreset: LayoutPreset = isLayoutPreset(theme.layoutPreset)
    ? theme.layoutPreset
    : "default";

  // Type guard for component set validation (Phase 3.1)
  type ComponentSet = "default" | "minimal" | "acme";
  const isComponentSet = (v: unknown): v is ComponentSet =>
    v === "default" || v === "minimal" || v === "acme";

  const componentSet: ComponentSet = isComponentSet(theme.componentSet)
    ? theme.componentSet
    : "default";

  return {
    tokens: base,
    brand: theme.brand,
    layoutPreset,
    componentSet,
  };
}

/**
 * Check canonicalized theme size ≤ 16KB (enforce at BFF write/normalize).
 * Uses UTF-8 byte length, not string length (Unicode-safe).
 */
export function isThemeWithinSizeLimit(theme: ResolvedTheme): boolean {
  return Buffer.byteLength(JSON.stringify(theme), "utf8") <= THEME_MAX_JSON_BYTES;
}

/**
 * Non-empty per audit 3.9 F: preset from allowlist OR at least one valid token.
 * brand does not count as content.
 */
export function isThemeNonEmpty(body: ThemeV1): boolean {
  const hasPreset =
    body.preset != null &&
    (THEME_V1_PRESETS as readonly string[]).includes(body.preset);
  const hasToken =
    body.tokens != null &&
    THEME_V1_TOKEN_KEYS.some((k) => body.tokens![k] != null);
  return hasPreset || hasToken;
}

/**
 * Build canonical ThemeV1 for DB storage (audit 3.9 F).
 * Uses normalized token values (hex, radius); shadow stored as preset name.
 */
export function buildCanonicalThemeV1ForStorage(body: ThemeV1): ThemeV1 {
  const resolved = normalizeToResolvedTheme(body);
  const shadowPreset: ThemeV1ShadowPreset =
    body.tokens?.shadow != null &&
      THEME_V1_SHADOW_PRESETS.includes(body.tokens.shadow)
      ? body.tokens.shadow
      : "none";
  const tokens: ThemeV1["tokens"] = {
    bg: resolved.tokens.bg,
    paper: resolved.tokens.paper,
    ink: resolved.tokens.ink,
    muted: resolved.tokens.muted,
    line: resolved.tokens.line,
    accent: resolved.tokens.accent,
    accentWeak: resolved.tokens.accentWeak,
    footerBg: resolved.tokens.footerBg,
    radius: resolved.tokens.radius,
    shadow: shadowPreset,

    // NEW (Phase 6): Persist new tokens if they exist in ResolvedTheme
    // Note: We only persist what came in via ThemeV1 if it's valid.
    // However, buildCanonicalThemeV1ForStorage is about storage format.
    // If we want to store them back, we should map them here, or rely on them being dropped if not in ThemeV1 type?
    // ThemeV1 type NOW has them (Phase 6.1). So we should map them.
    accentRgb: resolved.tokens.accentRgb,
    fontFamily: resolved.tokens.fontFamily,
    fontSizeBase: resolved.tokens.fontSizeBase,
    fontSizeSmall: resolved.tokens.fontSizeSmall,
    fontSizeLarge: resolved.tokens.fontSizeLarge,

    spaceXs: resolved.tokens.spaceXs,
    spaceS: resolved.tokens.spaceS,
    spaceM: resolved.tokens.spaceM,
    spaceL: resolved.tokens.spaceL,
    spaceXl: resolved.tokens.spaceXl,

    borderWidthThin: resolved.tokens.borderWidthThin,
    borderWidthThick: resolved.tokens.borderWidthThick,

    focusRingColor: resolved.tokens.focusRingColor,
    focusRingWidth: resolved.tokens.focusRingWidth,
  };
  return {
    version: 1,
    preset: body.preset ?? "default",
    layoutPreset: body.layoutPreset,
    componentSet: body.componentSet,
    tokens,
    brand: body.brand,
  };
}

/** Check stored ThemeV1 size ≤ 16KB (enforce before DB write). UTF-8 bytes, not string length. */
export function isStoredThemeWithinSizeLimit(theme: ThemeV1): boolean {
  return Buffer.byteLength(JSON.stringify(theme), "utf8") <= THEME_MAX_JSON_BYTES;
}

const BRAND_URL_KEYS = ["logoUrl", "faviconUrl", "fontUrl", "ogImage"] as const;

/**
 * Validate all brand URLs in ThemeV1: must be https, host must not be an IP (IPv4 or IPv6),
 * and host must not be localhost or .local (forbid private / local).
 * Rejects http, ip-literals, localhost, .local (incl. trailing-dot variants localhost., foo.local.),
 * and private/public IPs (strict: no sanitize, reject). Syntactic only — no DNS resolve.
 */
export function validateBrandUrls(brand: ThemeV1["brand"]): boolean {
  if (!brand) return true;
  for (const key of BRAND_URL_KEYS) {
    const val = brand[key];
    if (val == null || val === "") continue;
    try {
      const u = new URL(val);
      if (u.protocol !== "https:") return false;
      if (u.username || u.password) return false; // forbid userinfo (obfuscation / credentials in URL)
      let host = u.hostname;
      if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1);
      host = host.replace(/\.+$/, ""); // normalize trailing dot (localhost., foo.local.)
      if (!host) return false; // empty host after normalization (e.g. https://./)
      if (isIP(host) !== 0) return false;
      if (/^\d+$/.test(host)) return false; // numeric hostname (decimal IP, e.g. 2130706433 = 127.0.0.1)
      const hostLower = host.toLowerCase();
      if (hostLower === "localhost") return false;
      if (hostLower.endsWith(".local")) return false;
    } catch {
      return false;
    }
  }
  return true;
}

/** Reason for fallback (audit 3.9 B logging) */
export type ThemeFallbackReason =
  | "unknown_version"
  | "invalid_shape"
  | "invalid_value"
  | "null_or_missing";
