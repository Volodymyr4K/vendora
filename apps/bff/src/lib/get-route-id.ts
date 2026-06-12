/**
 * ACCESS_LEVELS Phase 2: Single runtime helper for routeId (method + normalized path).
 * Must match admin-route-registry format so getAdminRouteEntry(routeId) works.
 * Uses only route pattern (routerPath / routeOptions.url / routeOptions.routePath) — no guessing from req.url or registry.
 */

/** Minimal request shape for getRouteId (FastifyRequest has method, routerPath, routeOptions). */
export interface GetRouteIdRequest {
    method: string;
    url?: string;
    routerPath?: string;
    routeOptions?: { url?: string; routePath?: string };
}

/** Normalize path param names to canonical tokens: :branchSlug → :branch, *Id → :id */
function normalizePathPattern(path: string): string {
    const segments = path.split("/").filter(Boolean);
    const normalized = segments.map((seg) => {
        if (!seg.startsWith(":")) return seg;
        const name = seg.slice(1);
        if (name === "branchSlug" || name === "branch") return ":branch";
        if (name === "id" || name.endsWith("Id")) return ":id";
        return seg;
    });
    return "/" + normalized.join("/");
}

/** Strip /admin prefix so routeId matches registry (registry uses path without prefix). */
const ADMIN_PREFIX = "/admin";
const ADMIN_PREFIX_LEN = ADMIN_PREFIX.length;

/**
 * Build routeId from method + full url (e.g. for onRoute: method, opts.url).
 * Returns null if url is not under /admin.
 */
export function getRouteIdFromMethodAndUrl(method: string, url: string): string | null {
    if (url !== ADMIN_PREFIX && !url.startsWith(ADMIN_PREFIX + "/")) return null;
    let path = url === ADMIN_PREFIX ? "/" : url.slice(ADMIN_PREFIX_LEN) || "/";
    const pathNoTrailing = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
    const normalized = normalizePathPattern(pathNoTrailing);
    return `${method} ${normalized}`;
}

/**
 * Build routeId from request: METHOD + normalized path (no query, no trailing slash).
 * Uses only route pattern: req.routerPath, req.routeOptions.url, or req.routeOptions.routePath.
 * No fallback to req.url or registry lookup — deterministic SSOT.
 */
export function getRouteId(req: GetRouteIdRequest): string {
    const method = req.method;
    let path =
        req.routerPath ??
        req.routeOptions?.url ??
        req.routeOptions?.routePath ??
        "";
    if (path.startsWith(ADMIN_PREFIX + "/") || path === ADMIN_PREFIX) {
        path = path.length > ADMIN_PREFIX_LEN ? path.slice(ADMIN_PREFIX_LEN) || "/" : "/";
    }
    const pathNoTrailing = path.endsWith("/") && path.length > 1 ? path.slice(0, -1) : path;
    const normalized = normalizePathPattern(pathNoTrailing);
    return `${method} ${normalized}`;
}
