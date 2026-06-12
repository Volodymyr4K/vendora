import { NextRequest, NextResponse } from 'next/server';

type TenantMode = "default" | "chooser";
type TenantType = "subdomain" | "custom";
type TenantResolution = {
  tenantId: string;
  slug: string;
  type: TenantType;
  mode?: TenantMode;
  branchSlug?: string;
};

let tenantByDomainCache: Record<string, TenantResolution> | null = null;
function normalizeHostHeader(hostHeader: string | null): string | null {
  if (!hostHeader) return null;
  const host = (hostHeader.split(":").at(0) ?? "").trim().toLowerCase();
  if (!host) return null;
  return host.endsWith(".") ? host.slice(0, -1) : host;
}

function getTenantByDomain(): Record<string, TenantResolution> {
  if (tenantByDomainCache) return tenantByDomainCache;

  const raw = process.env.TENANT_BY_DOMAIN_JSON || "{}";
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Invalid TENANT_BY_DOMAIN_JSON (JSON parse): ${(e as Error)?.message || String(e)}`);
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Invalid TENANT_BY_DOMAIN_JSON: must be a JSON object");
  }

  const out: Record<string, TenantResolution> = {};
  for (const [domain, value] of Object.entries(parsed as Record<string, unknown>)) {
    const key = normalizeHostHeader(domain);
    if (!key) continue;

    if (typeof value !== "object" || !value || Array.isArray(value)) {
      throw new Error(`Invalid TENANT_BY_DOMAIN_JSON entry for ${domain}: expected object value`);
    }

    const tenantId = (value as Record<string, unknown>).tenantId;
    const slug = (value as Record<string, unknown>).slug;
    const type = (value as Record<string, unknown>).type;
    const mode = (value as Record<string, unknown>).mode;
    const branchSlug = (value as Record<string, unknown>).branchSlug;

    if (typeof tenantId !== "string" || !tenantId) {
      throw new Error(`Invalid TENANT_BY_DOMAIN_JSON entry for ${domain}: tenantId is required`);
    }
    if (typeof slug !== "string" || !slug) {
      throw new Error(`Invalid TENANT_BY_DOMAIN_JSON entry for ${domain}: slug is required`);
    }
    if (type !== "subdomain" && type !== "custom") {
      throw new Error(`Invalid TENANT_BY_DOMAIN_JSON entry for ${domain}: type must be 'subdomain'|'custom'`);
    }
    if (mode !== undefined && mode !== "default" && mode !== "chooser") {
      throw new Error(`Invalid TENANT_BY_DOMAIN_JSON entry for ${domain}: mode must be 'default'|'chooser'`);
    }
    if (branchSlug !== undefined && branchSlug !== null && typeof branchSlug !== "string") {
      throw new Error(`Invalid TENANT_BY_DOMAIN_JSON entry for ${domain}: branchSlug must be string`);
    }

    out[key] = {
      tenantId,
      slug,
      type,
      ...(mode ? { mode } : {}),
      ...(branchSlug ? { branchSlug } : {}),
    };
  }

  tenantByDomainCache = out;
  return out;
}

function resolveTenantByDomain(domain: string): TenantResolution | null {
  const map = getTenantByDomain();
  const direct = map[domain];
  if (direct) return direct;
  if (domain.startsWith("www.")) {
    const fallback = map[domain.slice(4)];
    if (fallback) return fallback;
  }
  return null;
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // /media is handled by a Next.js route handler proxy (same-origin) to keep CSP strict.
  if (pathname.startsWith("/media/")) {
    return NextResponse.next();
  }

  // [Phase 1S] Storm Protection: Hard Block on Static Assets
  const STATIC_EXT_RE = /\.(svg|png|jpe?g|gif|webp|ico|bmp|tiff|css|js|mjs|map|woff2?|ttf|eot|json|pdf|webmanifest)$/i;
  const STATIC_DIRS = ['/demo/', '/uploads/', '/assets/', '/images/', '/fonts/'];

  // NOTE: `/media/*` is proxied to BFF below; do not treat it as a static asset route.
  if (!pathname.startsWith('/media/') && (STATIC_DIRS.some(dir => pathname.startsWith(dir)) || STATIC_EXT_RE.test(pathname))) {
    return NextResponse.next();
  }
  if (pathname === '/healthz' || pathname === '/healthz/deep') {
    return NextResponse.next();
  }
  // Tenant resolution must use only the `Host` header (do not trust `x-forwarded-host` from the internet).
  const rawHostHeader = request.headers.get("host") || "";
  const domain = normalizeHostHeader(rawHostHeader);
  // For Next.js Server Actions, `x-forwarded-host` must match the request host (including port on localhost),
  // otherwise Next rejects the action as an invalid forwarded request.
  // Use the raw Host header (trusted by Next) rather than a normalized hostname.
  const forwardedHost = rawHostHeader || request.nextUrl.host || domain || "localhost";

  const host = domain?.toLowerCase() || "";
  const serviceHost = (process.env.SERVICE_DOMAIN || "").toLowerCase();
  const serviceSuffix = (process.env.SERVICE_DOMAIN_SUFFIX || "").toLowerCase();
  const isServiceDomain =
    host === "localhost" ||
    host.endsWith(".localhost") ||
    host === "127.0.0.1" ||
    host === serviceHost ||
    (serviceSuffix ? host.endsWith(serviceSuffix) : false);

  // [Phase 1G] Request Correlation
  // 1. Get or Generate Request ID
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();

  // [Phase 1H] Middleware Log Refinement
  // 1. request_in: Log basic request details (Early)
  // Removed direct console.log to satisfy lint.

  // Skip middleware for static assets and API routes
  const isPrivacyRoute = pathname === '/privacy' || pathname.startsWith('/privacy/');
  const isTermsRoute = pathname === '/terms' || pathname.startsWith('/terms/');
  const isImpressumRoute = pathname === '/impressum' || pathname.startsWith('/impressum/');
  if (
    !domain ||
    pathname.startsWith('/.well-known') || // Public verification endpoint
    pathname.startsWith('/super-admin') || // Super admin (no tenant needed)
    ((isPrivacyRoute || isTermsRoute || isImpressumRoute) && isServiceDomain) || // Keep legal pages global on service domains
    pathname.startsWith('/_next') ||
    // pathname.startsWith('/api') || // ENABLED for Tenant Context injection
    pathname.startsWith('/tenant-not-found') ||
    pathname.startsWith('/500') ||
    pathname === '/t'
  ) {
    return NextResponse.next();
  }

  // Canonicalize internal tenant paths on custom domains.
  // Users should browse `https://<custom-domain>/...`, not `https://<custom-domain>/t/<tenantSlug>/...`.
  // Keep `/t/...` working on service domains (e.g. *.fly.dev) and localhost for admin/dev access.
  if (pathname.startsWith('/t/')) {
    // If this is a custom domain, redirect `/t/<tenantSlug>/...` back to clean URLs,
    // except for branch-admin paths (`/t/<tenantSlug>/<branchSlug>/admin/...`).
    if (!isServiceDomain) {
      const segments = pathname.split('/').filter(Boolean); // ["t", tenantSlug, ...rest]
      const rest = segments.slice(2);
      const hasBranchAdmin = rest.length >= 2 && rest[1] === "admin";

      if (!hasBranchAdmin) {
        const tenantLevel = new Set([
          "main",
          "choose-city",
          "profile",
          "login",
          "register",
          "logout",
          "reset-password",
          "catalog",
          "authors",
          "about",
          "media",
          "journal",
          "privacy",
          "terms",
          "impressum",
        ]);

        let canonicalPath = "/";
        const first = rest[0];
        if (!first || first === "main") {
          canonicalPath = "/";
        } else if (first === "choose-city") {
          canonicalPath = "/choose-city";
        } else if (tenantLevel.has(first)) {
          canonicalPath = `/${rest.join("/")}`;
        } else if (rest.length >= 2) {
          // Strip branch slug: /t/<tenantSlug>/<branchSlug>/<path> => /<path>
          canonicalPath = `/${rest.slice(1).join("/")}`;
        } else {
          canonicalPath = "/";
        }

        const url = request.nextUrl.clone();
        url.pathname = canonicalPath;
        return NextResponse.redirect(url, 308);
      }
    }

	    const requestHeaders = new Headers(request.headers);
	    // Security: do not trust spoofable proxy headers; keep a deterministic forwarded host for internal proxying/logging.
	    requestHeaders.delete('x-forwarded-host');
	    requestHeaders.set('x-forwarded-host', forwardedHost);
	    requestHeaders.set('x-request-id', requestId);
    requestHeaders.delete('x-url-kind');
    requestHeaders.delete('x-tenant-slug');
    requestHeaders.delete('x-tenant-mode');
    requestHeaders.delete('x-branch-slug');
    requestHeaders.set('x-url-kind', 'path');

    const segments = pathname.split('/').filter(Boolean);
    const tenantSlug = segments[1];
    const seg2 = segments[2];
    const reservedTenantSlugs = new Set([
      'profile',
      'login',
      'choose-city',
      'register',
      'logout',
      'reset-password',
    ]);
    const branchSlug = seg2 && !reservedTenantSlugs.has(seg2) ? seg2 : undefined;

    if (tenantSlug) {
      requestHeaders.set('x-tenant-slug', tenantSlug);
    }
    if (branchSlug) {
      requestHeaders.set('x-branch-slug', branchSlug);
      requestHeaders.set('x-tenant-mode', 'default');
    }

    return NextResponse.next({
      request: { headers: requestHeaders }
    });
  }

  // [Phase 1X] Intent-Based Gating (Performance)
  // Only run middleware for Pages (HTML), RSC (Next.js), Actions, or API.
  // Skip everything else (Public Assets, JSON, etc.) to save BFF calls.
  const isApi = pathname.startsWith('/api');
  const isPage = request.headers.get('accept')?.includes('text/html');
  const isRsc = request.headers.get('rsc') === '1';
  const isAction = request.headers.has('next-action');
  const isPrefetch = request.headers.has('next-router-prefetch');

  // For custom domains, always resolve tenant to avoid accidental fall-through to the platform demo routes
  // (which can trigger tenant-less BFF requests and surface "Application error" digests).
  const shouldResolveTenant = !isServiceDomain || isApi || isPage || isRsc || isAction || isPrefetch;
  if (!shouldResolveTenant) {
    return NextResponse.next();
  }

  try {
    const resolved = resolveTenantByDomain(host);
    if (!resolved) {
      if (isApi) {
        return NextResponse.json({ error: 'TENANT_NOT_FOUND' }, { status: 404 });
      }
      const url = request.nextUrl.clone();
      url.pathname = '/tenant-not-found';
      return NextResponse.rewrite(url);
    }

    const { tenantId, slug, type, mode, branchSlug } = resolved;
    const resolvedMode = mode ?? (branchSlug ? 'default' : 'chooser');
    const tenantLevelPrefixes = ['/profile', '/login', '/choose-city'];
    const authPrefixes = ['/login', '/register', '/logout', '/reset-password'];
    const amTenantPaths = new Set([
      "/main",
      "/catalog",
      "/authors",
      "/about",
      "/media",
      "/journal",
      "/privacy",
      "/terms",
      "/impressum",
    ]);
    const isAmTenantPath = amTenantPaths.has(pathname);
    const isTenantLevel = tenantLevelPrefixes.some(prefix => (
      pathname === prefix || pathname.startsWith(`${prefix}/`)
    ));

    // [Phase 1H] Log Resolution Success
    // Removed direct console.log to satisfy lint.

    // Inject headers for Server Components
    const requestHeaders = new Headers(request.headers);

    // [Phase 1G] Context Propagation & Anti-Spoofing
    // 1. Force Overwrite Tenant Context (Security: Client cannot spoof these)
    requestHeaders.set('x-tenant-id', tenantId);
    requestHeaders.set('x-tenant-slug', slug); // <-- Trusted Source of Truth
    requestHeaders.set('x-tenant-type', type);

    // 2. Propagate Request ID
    requestHeaders.set('x-request-id', requestId);

    // 3. Ensure Forwarded Host (for Proxy)
    requestHeaders.delete('x-forwarded-host');
    requestHeaders.set('x-forwarded-host', forwardedHost);
    requestHeaders.delete('x-url-kind');
    requestHeaders.delete('x-tenant-slug');
    requestHeaders.delete('x-tenant-mode');
    requestHeaders.delete('x-branch-slug');
    requestHeaders.set('x-url-kind', 'domain');
    requestHeaders.set('x-tenant-slug', slug);
    requestHeaders.set('x-tenant-mode', resolvedMode);
    if (branchSlug) {
      requestHeaders.set('x-branch-slug', branchSlug);
    }

    // API Routes: Continue without rewriting path, but WITH injected headers
    if (pathname.startsWith('/api')) {
      return NextResponse.next({
        request: { headers: requestHeaders }
      });
    }

    // Rewrite to tenant-specific route
    const url = request.nextUrl.clone();

    if (pathname === "/" && resolvedMode === "default" && branchSlug) {
      url.pathname = `/t/${slug}/main`;
    } else if (isTenantLevel || isAmTenantPath) {
      url.pathname = `/t/${slug}${pathname}`;
    } else if (resolvedMode === 'default' && branchSlug) {
      url.pathname = `/t/${slug}/${branchSlug}${pathname}`;
    } else {
      url.pathname = `/t/${slug}/choose-city`;
      const redirectTarget = `${pathname}${request.nextUrl.search || ''}`;
      const isAuthPath = authPrefixes.some(prefix => (
        pathname === prefix || pathname.startsWith(`${prefix}/`)
      ));
      if (
        redirectTarget.startsWith('/') &&
        !redirectTarget.startsWith('//') &&
        !redirectTarget.includes('://') &&
        !isAuthPath
      ) {
        url.search = `?redirect=${encodeURIComponent(redirectTarget)}`;
      }
    }

    return NextResponse.rewrite(url, {
      request: { headers: requestHeaders }
    });

  } catch (error) {
    console.error('Middleware error:', error);

    // Fallback to 500 page
    if (isApi) {
      return NextResponse.json({ error: 'INTERNAL_ERROR' }, { status: 500 });
    }
    const url = request.nextUrl.clone();
    url.pathname = '/500';
    return NextResponse.rewrite(url);
  }
}


// Matcher config - exclude static assets; explicitly include tenant-critical API routes so middleware runs and overwrites x-tenant-* from Host→BFF resolve.
// Covers: /api/quote, /api/order, /api/order/[token], /api/payment/confirm. List must match docs/WEB_API_TENANT_CRITICAL_ROUTES.md.
export const config = {
  matcher: [
    '/media/:path*',
    '/((?!api/|_next/static|_next/image|demo/|uploads/|assets/|images/|fonts/|favicon.ico|robots.txt|sitemap.xml|manifest.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|bmp|tiff|css|js|mjs|map|woff|woff2|ttf|eot|json|pdf)).*)',
    '/api/quote',
    '/api/order/:path*',
    '/api/payment/confirm',
  ],
};
