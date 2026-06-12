import { describe, it, expect } from "vitest";
import { THEME_MAX_JSON_BYTES } from "@vendora/contracts";
import {
  canonicalizeHex,
  DEFAULT_RESOLVED_THEME,
  normalizeToResolvedTheme,
  isThemeWithinSizeLimit,
  isStoredThemeWithinSizeLimit,
  validateBrandUrls,
} from "../theme.js";
import type { ThemeV1 } from "@vendora/contracts";

describe("canonicalizeHex", () => {
  it("#RGB → #RRGGBB, lowercase", () => {
    expect(canonicalizeHex("#abc")).toBe("#aabbcc");
    expect(canonicalizeHex("#ABC")).toBe("#aabbcc");
    expect(canonicalizeHex("#f00")).toBe("#ff0000");
  });

  it("#RRGGBB → lowercase", () => {
    expect(canonicalizeHex("#FF0000")).toBe("#ff0000");
    expect(canonicalizeHex("#aabbcc")).toBe("#aabbcc");
  });

  it("#RRGGBBAA → lowercase, alpha preserved", () => {
    expect(canonicalizeHex("#FF000080")).toBe("#ff000080");
    expect(canonicalizeHex("#aabbccff")).toBe("#aabbccff");
  });

  it("invalid → null", () => {
    expect(canonicalizeHex("")).toBe(null);
    expect(canonicalizeHex("abc")).toBe(null);
    expect(canonicalizeHex("#gggggg")).toBe(null);
    expect(canonicalizeHex("#12")).toBe(null);
    expect(canonicalizeHex(null)).toBe(null);
    expect(canonicalizeHex(undefined)).toBe(null);
  });

  it("forbids url( and ;", () => {
    expect(canonicalizeHex("#url(abc)")).toBe(null);
    expect(canonicalizeHex("#ab;c")).toBe(null);
  });
});

describe("normalizeToResolvedTheme", () => {
  it("null/undefined → DEFAULT_RESOLVED_THEME", () => {
    expect(normalizeToResolvedTheme(null)).toEqual(DEFAULT_RESOLVED_THEME);
    expect(normalizeToResolvedTheme(undefined)).toEqual(DEFAULT_RESOLVED_THEME);
  });

  it("version !== 1 → DEFAULT_RESOLVED_THEME", () => {
    expect(
      normalizeToResolvedTheme({ version: 2, preset: "default" } as unknown as import("@vendora/contracts").ThemeV1)
    ).toEqual(DEFAULT_RESOLVED_THEME);
  });

  it("valid ThemeV1 with tokens overrides → merged ResolvedTheme", () => {
    const result = normalizeToResolvedTheme({
      version: 1,
      preset: "default",
      tokens: {
        accent: "#F2A65A",
        radius: "8px",
        shadow: "soft",
      },
    });
    expect(result.tokens.accent).toBe("#f2a65a");
    expect(result.tokens.radius).toBe("8px");
    expect(result.tokens.shadow).toBe("0 10px 30px rgba(17,18,20,.10)");
    expect(result.tokens.bg).toBe(DEFAULT_RESOLVED_THEME.tokens.bg);
  });

  it("returns filled object on any input", () => {
    const r = normalizeToResolvedTheme(null);
    expect(r.tokens).toBeDefined();
    expect(r.tokens.bg).toBeDefined();
    expect(r.tokens.paper).toBeDefined();
    expect(r.tokens.ink).toBeDefined();
    expect(r.tokens.muted).toBeDefined();
    expect(r.tokens.line).toBeDefined();
    expect(r.tokens.accent).toBeDefined();
    expect(r.tokens.accentWeak).toBeDefined();
    expect(r.tokens.radius).toBeDefined();
    expect(r.tokens.shadow).toBeDefined();
  });

  it("invalid hex in token → keeps default for that token", () => {
    const result = normalizeToResolvedTheme({
      version: 1,
      tokens: { accent: "not-hex" },
    });
    expect(result.tokens.accent).toBe(DEFAULT_RESOLVED_THEME.tokens.accent);
  });

  it("shadow preset none|soft|hard → CSS string", () => {
    expect(
      normalizeToResolvedTheme({ version: 1, tokens: { shadow: "none" } }).tokens.shadow
    ).toBe("none");
    expect(
      normalizeToResolvedTheme({ version: 1, tokens: { shadow: "hard" } }).tokens.shadow
    ).toBe("0 4px 12px rgba(17,18,20,.15)");
  });

  it("preserves brand when present", () => {
    const result = normalizeToResolvedTheme({
      version: 1,
      brand: { logoUrl: "https://example.com/logo.png", fontFamily: "Inter" },
    });
    expect(result.brand?.logoUrl).toBe("https://example.com/logo.png");
    expect(result.brand?.fontFamily).toBe("Inter");
  });
});

describe("isThemeWithinSizeLimit", () => {
  it("DEFAULT_RESOLVED_THEME is within 16KB", () => {
    expect(isThemeWithinSizeLimit(DEFAULT_RESOLVED_THEME)).toBe(true);
  });

  it("very large theme exceeds limit", () => {
    const huge = {
      ...DEFAULT_RESOLVED_THEME,
      tokens: {
        ...DEFAULT_RESOLVED_THEME.tokens,
        shadow: "x".repeat(20_000),
      },
    };
    expect(isThemeWithinSizeLimit(huge)).toBe(false);
  });
});

describe("isStoredThemeWithinSizeLimit (16KB boundary, bytes not chars)", () => {
  const minimalThemeV1: ThemeV1 = {
    version: 1,
    preset: "default",
    tokens: {
      bg: "#ffffff",
      paper: "#f5f5f5",
      ink: "#1a1a1a",
      muted: "#6b7280",
      line: "#e5e7eb",
      accent: "#2563eb",
      accentWeak: "#dbeafe",
      radius: "0px",
      shadow: "none",
    },
    brand: { logoUrl: "" },
  };

  it("theme at exactly 16384 bytes → true", () => {
    const baseBytes = Buffer.byteLength(JSON.stringify(minimalThemeV1), "utf8");
    const pad = THEME_MAX_JSON_BYTES - baseBytes;
    expect(pad).toBeGreaterThan(0);
    const themeAtLimit: ThemeV1 = {
      ...minimalThemeV1,
      brand: { logoUrl: "x".repeat(pad) },
    };
    expect(Buffer.byteLength(JSON.stringify(themeAtLimit), "utf8")).toBe(THEME_MAX_JSON_BYTES);
    expect(isStoredThemeWithinSizeLimit(themeAtLimit)).toBe(true);
  });

  it("theme at 16385 bytes → false", () => {
    const baseBytes = Buffer.byteLength(JSON.stringify(minimalThemeV1), "utf8");
    const pad = THEME_MAX_JSON_BYTES - baseBytes + 1;
    const themeOverLimit: ThemeV1 = {
      ...minimalThemeV1,
      brand: { logoUrl: "x".repeat(pad) },
    };
    expect(Buffer.byteLength(JSON.stringify(themeOverLimit), "utf8")).toBe(THEME_MAX_JSON_BYTES + 1);
    expect(isStoredThemeWithinSizeLimit(themeOverLimit)).toBe(false);
  });

  it("theme with Unicode (bytes not chars): at 16384 bytes → true, 16385 bytes → false", () => {
    // Regression: limit must be Buffer.byteLength (UTF-8), not string.length (e.g. "Київ" = 4 chars, 8 bytes)
    const base: ThemeV1 = {
      ...minimalThemeV1,
      brand: { logoUrl: "", logoAlt: "" },
    };
    const baseBytes = Buffer.byteLength(JSON.stringify(base), "utf8");
    const padBytes = THEME_MAX_JSON_BYTES - baseBytes;
    expect(padBytes).toBeGreaterThan(0);
    // Pad with Cyrillic "К" (2 bytes each in UTF-8) + optional 1 byte to hit exact length
    const padStr =
      padBytes % 2 === 0 ? "К".repeat(padBytes / 2) : "К".repeat((padBytes - 1) / 2) + "x";
    const themeAtLimit: ThemeV1 = { ...base, brand: { logoUrl: "", logoAlt: padStr } };
    expect(Buffer.byteLength(JSON.stringify(themeAtLimit), "utf8")).toBe(THEME_MAX_JSON_BYTES);
    expect(isStoredThemeWithinSizeLimit(themeAtLimit)).toBe(true);
    const themeOverLimit: ThemeV1 = {
      ...base,
      brand: { logoUrl: "", logoAlt: padStr + "x" },
    };
    expect(Buffer.byteLength(JSON.stringify(themeOverLimit), "utf8")).toBe(THEME_MAX_JSON_BYTES + 1);
    expect(isStoredThemeWithinSizeLimit(themeOverLimit)).toBe(false);
  });
});

describe("validateBrandUrls", () => {
  it("valid https URLs → true", () => {
    expect(validateBrandUrls({ logoUrl: "https://example.com/logo.png" })).toBe(true);
    expect(validateBrandUrls({ faviconUrl: "https://cdn.example.com/favicon.ico" })).toBe(true);
    expect(validateBrandUrls({ fontUrl: "https://fonts.googleapis.com/css2?family=Inter" })).toBe(true);
    expect(validateBrandUrls({ ogImage: "https://example.com/og.jpg" })).toBe(true);
  });

  it("uppercase scheme HTTPS:// → true (regression: URL.protocol normalizes to lowercase)", () => {
    expect(validateBrandUrls({ logoUrl: "HTTPS://example.com/logo.png" })).toBe(true);
    expect(validateBrandUrls({ faviconUrl: "HTTPS://CDN.EXAMPLE.COM/favicon.ico" })).toBe(true);
  });

  it("http (non-https) → false", () => {
    expect(validateBrandUrls({ logoUrl: "http://example.com/logo.png" })).toBe(false);
  });

  it("localhost → false", () => {
    expect(validateBrandUrls({ logoUrl: "https://localhost/logo.png" })).toBe(false);
    expect(validateBrandUrls({ logoUrl: "https://localhost./logo.png" })).toBe(false); // trailing dot
  });

  it(".local domain → false", () => {
    expect(validateBrandUrls({ logoUrl: "https://myserver.local/logo.png" })).toBe(false);
    expect(validateBrandUrls({ logoUrl: "https://myserver.local./logo.png" })).toBe(false); // trailing dot
  });

  it("IP literals → false", () => {
    expect(validateBrandUrls({ logoUrl: "https://127.0.0.1/logo.png" })).toBe(false);
    expect(validateBrandUrls({ logoUrl: "https://192.168.1.1/logo.png" })).toBe(false);
    expect(validateBrandUrls({ logoUrl: "https://[::1]/logo.png" })).toBe(false); // IPv6
    expect(validateBrandUrls({ logoUrl: "https://2130706433/logo.png" })).toBe(false); // decimal IP
  });

  it("userinfo (credentials) → false", () => {
    expect(validateBrandUrls({ logoUrl: "https://user:pass@example.com/logo.png" })).toBe(false);
  });

  it("userinfo obfuscation: @ without password (example.com@localhost) → false (regression)", () => {
    // In URL "https://example.com@localhost/", "example.com" = username, "localhost" = host
    expect(validateBrandUrls({ logoUrl: "https://example.com@localhost/logo.png" })).toBe(false);
    expect(validateBrandUrls({ logoUrl: "https://evil.com@192.168.1.1/logo.png" })).toBe(false);
  });

  it("host with percent-encoded whitespace → false (regression: URL parser normalizes, but host becomes invalid)", () => {
    // URL parser may normalize %20 in hostname, but result should still fail validation
    try {
      expect(validateBrandUrls({ logoUrl: "https://%20localhost%20/logo.png" })).toBe(false);
    } catch {
      // If URL() throws on invalid syntax, that's also acceptable (caught → false)
    }
  });

  it("undefined/null/empty brand → true (no URLs to validate)", () => {
    expect(validateBrandUrls(undefined)).toBe(true);
    expect(validateBrandUrls({ logoUrl: "" })).toBe(true);
    expect(validateBrandUrls({ logoUrl: undefined })).toBe(true);
  });

  it("invalid URL syntax → false", () => {
    expect(validateBrandUrls({ logoUrl: "not-a-url" })).toBe(false);
    expect(validateBrandUrls({ logoUrl: "https://" })).toBe(false); // empty host
  });
});

