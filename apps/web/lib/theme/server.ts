/**
 * Server-only theme utilities. Audit 3.5, 3.9 E, 3.10.
 * themeToCssVars must only be used in server layout — import in client will fail (server-only).
 */
import "server-only";
import type { ResolvedTheme } from "@vendora/contracts";
import type React from "react";

/**
 * Maps ResolvedTheme.tokens to CSS custom property names (table 3.5).
 * No conditions or fallback logic — BFF always sends full ResolvedTheme.
 */

const FALLBACK_ACCENT_RGB = "242 166 90";

/**
 * Converts hex color (#RGB, #RRGGBB, or #RRGGBBAA) to RGB string format ("r g b").
 * For 8-digit hex (#RRGGBBAA), alpha channel is ignored.
 * Returns fallback if hex is invalid or missing.
 */
function hexToRgbString(hex: string | null | undefined, fallback: string): string {
  if (!hex || typeof hex !== "string") return fallback;
  
  const cleanHex = hex.replace("#", "").trim();
  
  let r = 0, g = 0, b = 0;
  
  if (cleanHex.length === 3) {
    r = parseInt(cleanHex[0]! + cleanHex[0]!, 16);
    g = parseInt(cleanHex[1]! + cleanHex[1]!, 16);
    b = parseInt(cleanHex[2]! + cleanHex[2]!, 16);
  } else if (cleanHex.length === 6) {
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  } else if (cleanHex.length === 8) {
    // 8-digit hex: ignore alpha channel, use first 6 digits for RGB
    r = parseInt(cleanHex.slice(0, 2), 16);
    g = parseInt(cleanHex.slice(2, 4), 16);
    b = parseInt(cleanHex.slice(4, 6), 16);
  } else {
    return fallback;
  }
  
  if (isNaN(r) || isNaN(g) || isNaN(b)) return fallback;
  
  return `${r} ${g} ${b}`;
}

export function themeToCssVars(theme: ResolvedTheme): Record<string, string> {
  const rawAccentRgb = theme.tokens.accentRgb;
  const accentRgb = (typeof rawAccentRgb === "string" && rawAccentRgb.trim().length > 0)
    ? rawAccentRgb.trim()
    : hexToRgbString(theme.tokens.accent, FALLBACK_ACCENT_RGB);

  // Dev-only warning to catch missing tokens without polluting prod logs
  if (accentRgb === FALLBACK_ACCENT_RGB && process.env.NODE_ENV !== "production") {
    console.warn("[theme] Missing tokens.accentRgb; using fallback:", FALLBACK_ACCENT_RGB);
  }

  const vars: Record<string, string> = {
    // Existing colors
    "--bg": theme.tokens.bg,
    "--paper": theme.tokens.paper,
    "--ink": theme.tokens.ink,
    "--muted": theme.tokens.muted,
    "--line": theme.tokens.line,
    "--accent": theme.tokens.accent,
    "--accent-weak": theme.tokens.accentWeak,
    "--footer-bg": theme.tokens.footerBg,
    "--radius": theme.tokens.radius,
    "--shadow": theme.tokens.shadow,

    // Tailwind aliases
    "--background": theme.tokens.bg,
    "--foreground": theme.tokens.ink,

    // Semantic color aliases (for Tailwind)
    "--color-accent": theme.tokens.accent,

    // RGB tokens for Tailwind slash-opacity support
    "--color-accent-rgb": accentRgb,
    // Backward compatibility: alias for --color-accent-rgb
    "--accent-rgb": accentRgb,

    // NEW (Phase 6): Typography
    "--font-family": theme.tokens.fontFamily,
    // Per-tenant font stacks (used by Tailwind font-* utilities)
    "--font-sans": theme.tokens.fontFamily,
    "--font-serif": theme.brand?.fontFamily ?? theme.tokens.fontFamily,
    "--font-mono": "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace",
    "--font-size-base": theme.tokens.fontSizeBase,
    "--font-size-small": theme.tokens.fontSizeSmall,
    "--font-size-large": theme.tokens.fontSizeLarge,
    "--line-height-base": theme.tokens.lineHeightBase,
    "--font-weight-normal": theme.tokens.fontWeightNormal.toString(),
    "--font-weight-bold": theme.tokens.fontWeightBold.toString(),
    "--font-weight-black": theme.tokens.fontWeightBlack.toString(),

    // NEW (Phase 6): Spacing
    "--space-xs": theme.tokens.spaceXs,
    "--space-s": theme.tokens.spaceS,
    "--space-m": theme.tokens.spaceM,
    "--space-l": theme.tokens.spaceL,
    "--space-xl": theme.tokens.spaceXl,

    // NEW (Phase 6): Borders
    "--border-width-thin": theme.tokens.borderWidthThin,
    "--border-width-thick": theme.tokens.borderWidthThick,

    // NEW (Phase 6): States
    "--focus-ring-color": theme.tokens.focusRingColor,
    "--focus-ring-width": theme.tokens.focusRingWidth,
  };

  // Semantic status colors: emit ONLY if tenant token exists
  if (theme.tokens.success) {
    vars["--color-success"] = theme.tokens.success;
    vars["--color-success-rgb"] = hexToRgbString(theme.tokens.success, "");
  }
  if (theme.tokens.warning) {
    vars["--color-warning"] = theme.tokens.warning;
    vars["--color-warning-rgb"] = hexToRgbString(theme.tokens.warning, "");
  }
  if (theme.tokens.danger) {
    vars["--color-danger"] = theme.tokens.danger;
    vars["--color-danger-rgb"] = hexToRgbString(theme.tokens.danger, "");
  }
  if (theme.tokens.info) {
    vars["--color-info"] = theme.tokens.info;
    vars["--color-info-rgb"] = hexToRgbString(theme.tokens.info, "");
  }

  return vars;
}

/**
 * Converts themeToCssVars output (Record<string, string>) into a safe CSS declaration string
 * for :root selector. Handles undefined/null values and strips any accidental '}' or '</style' substrings defensively.
 */
export function themeVarsToCssString(vars: React.CSSProperties | Record<string, string | number | null | undefined>): string {
  const declarations: string[] = [];
  
  for (const [key, value] of Object.entries(vars)) {
    if (!key.startsWith("--")) continue;
    if (value == null) {
      continue;
    }
    
    // Defensively strip any accidental '}' or '</style' substrings
    const safeValue = String(value)
      .replace(/}/g, "")
      .replace(/<\/style/gi, "");
    
    // Escape key if needed (shouldn't be necessary for CSS custom properties, but defensive)
    const safeKey = key.replace(/[^a-zA-Z0-9-_]/g, "");
    
    if (safeKey && safeValue) {
      declarations.push(`${safeKey}:${safeValue}`);
    }
  }
  
  return declarations.join(";");
}
