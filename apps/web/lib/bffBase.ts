function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function isFlyRuntime(): boolean {
  // Fly sets these at runtime; they are typically absent during image build.
  return Boolean(process.env.FLY_APP_NAME || process.env.FLY_REGION);
}

function isPublicishBffUrl(url: string): boolean {
  const u = url.trim().toLowerCase();
  return u.includes("fly.dev") || u.startsWith("https://");
}

let warnedPublicishFallback = false;

/**
 * BFF base URL for server->server calls from web.
 *
 * Prod invariants (Fly runtime):
 * - `BFF_INTERNAL_BASE_URL` is required (fail-fast on misconfig).
 * - The returned base URL never falls back to `BFF_BASE_URL` in prod.
 * - If `BFF_BASE_URL` is public-ish (fly.dev/https), we log a warning because it's stale/misleading config.
 */
export function getBffBaseUrl(): string {
  const internal = (process.env.BFF_INTERNAL_BASE_URL || "").trim();
  const fallback = (process.env.BFF_BASE_URL || "").trim();
  const isProd = process.env.NODE_ENV === "production";

  if (isProd && isFlyRuntime()) {
    if (!internal) {
      throw new Error("misconfigured: missing BFF_INTERNAL_BASE_URL (required in production)");
    }
    if (fallback && isPublicishBffUrl(fallback) && !warnedPublicishFallback) {
      warnedPublicishFallback = true;
      // Do not crash prod for a stale fallback value; we never use it in production anyway.
      console.warn("config warning: BFF_BASE_URL is public-ish in production; expected internal URL or empty");
    }
    return trimTrailingSlash(internal);
  }

  return trimTrailingSlash(internal || fallback || "http://localhost:3001");
}
