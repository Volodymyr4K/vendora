import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { prisma } from "@vendora/database";
import { tenantCacheHits, tenantCacheMisses, tenantResolutionDuration } from "../lib/metrics.js";
import { resolveTenant } from "../services/tenant-resolver.js";
import type { MainTemplateId, ResolvedTheme, TenantFeatures } from "@vendora/contracts";

export interface TenantContext {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    customDomainsEnabled: boolean;
    countryCode?: string;
    currency?: string;
    features?: TenantFeatures | null; // Feature flags; null = tenant not configured (503)
    theme: ResolvedTheme; // Design tokens; from req.tenant only (audit 3.4)
    mainTemplate: MainTemplateId; // settings.mainTemplate (resolved)
    amContent?: unknown; // settings.amContent (AM-only)
}

/**
 * Tenant Context Plugin - Multi-tenancy resolution
 * 
 * Supports:
 * - Base domain subdomains (tenant.vendora.local)
 * - Custom domains (example.com)
 * - Dual-LRU caching (O(1) lookups)
 * - Ghost domain protection
 * 
 * UPGRADES from old version:
 * - Custom domain support
 * - Unified caching (CacheManager)
 * - Performance optimizations (< 1ms cache hits)
 */

export async function tenantContextPlugin(app: FastifyInstance) {
    // Define routes that skip tenant resolution (O(1) lookup)
    const SKIP_TENANT_ROUTES = new Set([
        '/auth/super-login', // Super admin login (no tenant required)
        '/auth/switch-tenant', // ACCESS_LEVELS Phase 2: tenant from body, not header
        '/auth/logout',
        '/metrics',
        '/health'
    ]);
    // /auth/login NOT in skip: tenant-context resolves tenant from header; login handler uses req.tenant (invariant B in plan)

    const mediaPrefix = (process.env.MEDIA_ROUTE_PREFIX || '/media').trim();
    const normalizedMediaPrefix = (mediaPrefix.startsWith('/') ? mediaPrefix : `/${mediaPrefix}`).replace(/\/$/, '');
    const SKIP_TENANT_PREFIXES = [
        '/super/',
        '/internal/',
        // Public webhook ingress must not require x-tenant-slug (tenant resolved differently).
        '/webhooks/'
    ];

    app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
        // CRITICAL: Strip query params before checking
        // /auth/login?redirect=/profile → /auth/login
        const url = req.url;
        const path = url.split('?')[0] ?? url;

        // Check if should skip tenant resolution
        const shouldSkip =
            SKIP_TENANT_ROUTES.has(path) ||
            SKIP_TENANT_PREFIXES.some(prefix => path.startsWith(prefix)) ||
            path === normalizedMediaPrefix ||
            path.startsWith(`${normalizedMediaPrefix}/`);

        if (shouldSkip) {
            return; // Skip tenant resolution
        }

        // [Phase 1G] Request Correlation: The One King
        const requestId = req.headers['x-request-id'];
        if (requestId && typeof requestId === 'string') {
            req.id = requestId;
        }

        const startTime = Date.now();

        // [Phase 1G] Fail Fast: Protocol Violation
        // We strictly expect x-tenant-slug to be present (injected by Web Middleware or passed by Mobile App)
        // For legacy support or direct browser access to BFF (swagger?), we might fallback to host, 
        // BUT per plan we want Strict Fail Fast.
        // Let's implement Strict Mode for 'server-side' calls, but what about local dev direct access?
        // The plan said: "Missing x-tenant-slug -> 400".
        // Let's honor the plan. This forces all clients to be good citizens.

        const tenantSlugHeader = req.headers['x-tenant-slug'] as string | undefined;

        if (!tenantSlugHeader) {
            // Fastify runtime-decorated logger
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
            if (reqLog) {
                reqLog.warn({ event: 'MISSING_TENANT_HEADER', url: (req.url ?? "").split("?")[0] ?? "" }, 'Protocol Violation: x-tenant-slug missing');
            }
            return reply.code(400).send({
                error: "Protocol Violation: x-tenant-slug header required",
                code: "MISSING_TENANT_SLUG"
            });
        }

        // We trust the header because it comes from internal network (Web Middleware) or valid App Client
        // But we still resolve it against DB to ensure existence.

        // Note: resolveTenant expects a domain/hostname usually.
        // We need to verify if resolveTenant can handle a slug directly or if it expects a domain.
        // Looking at import { resolveTenant } from "../services/tenant-resolver.js";
        // If resolveTenant logic is domain-based, we might need to adjust usage or pass slug as "slug.local" to trick it?
        // Actually, let's fix the logic to be clean.
        // If we strictly rely on slug, we should look up by slug.
        // BUT we don't want to rewrite tenant-resolver service right now if possible (Scope Creep).
        // Let's see how `resolveTenant` works. 
        // Wait, I can't see `resolveTenant` implementation here.
        // I should stick to existing logic BUT use the header as the Source of Truth for the "hostname/slug".

        // Optimization: if we have slug, we can construct a fake domain to satisfy resolveTenant 
        // OR better, checking line 69 original:
        // const rawHostname: string = tenantSlugHeader ? `${tenantSlugHeader}.${process.env.BASE_DOMAIN...}` : ...
        // So the old logic WAS using the header to synthesize a domain!
        // So we keep that synthesis but make the header MANDATORY.

        const rawHostname = `${tenantSlugHeader}.${process.env.BASE_DOMAIN || 'vendora.local'}`;
        const hostname = rawHostname; // It's already clean-ish.

        // Resolve tenant from domain (supports both subdomains and custom domains)
        const result = await resolveTenant(prisma, hostname);

        if (!result) {
            // Fastify runtime-decorated logger
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
            if (reqLog) {
                reqLog.warn({
                    hostname,
                    event: 'TENANT_NOT_FOUND'
                }, 'Tenant resolution failed');
            }

            return reply.code(404).send({
                error: "Tenant not found",
                domain: hostname,
            });
        }

        const { tenant, type } = result;

        // Check if tenant is active
        if (!tenant.isActive) {
            // Fastify runtime-decorated logger
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
            if (reqLog) {
                reqLog.warn({
                    hostname,
                    tenantId: tenant.id,
                    tenantSlug: tenant.slug,
                    isActive: false,
                    event: 'INACTIVE_TENANT_ACCESS'
                }, 'Tenant is inactive - blocking access');
            }

            return reply.code(403).send({
                error: "Tenant is inactive",
                tenantSlug: tenant.slug,
            });
        }

        // Attach tenant to request with defensive defaults
        const tenantContext: TenantContext = {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            isActive: tenant.isActive,
            customDomainsEnabled: tenant.customDomainsEnabled,
            countryCode: tenant.countryCode || 'UA',    // Default to Ukraine if missing
            currency: tenant.currency || 'UAH',          // Default to Hryvnia if missing
            features: tenant.features as TenantFeatures | null | undefined, // Feature flags; null = not configured
            theme: tenant.theme,
            mainTemplate: tenant.mainTemplate,
            amContent: tenant.amContent,
        };

        req.tenant = tenantContext as FastifyRequest['tenant'];

        // Backward compatibility
        req.tenantId = tenant.id;

        // Step 2 (AUDIT_6): Fail-fast if features missing — invariant broken (resolver/cache did not provide features)
        // Applies only where tenant-context is required (we are already on that path).
        if (tenantContext.features === undefined) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
            if (reqLog) {
                reqLog.warn({
                    tenantId: tenant.id,
                    tenantSlug: tenant.slug,
                    event: 'TENANT_FEATURES_MISSING'
                }, 'Tenant features missing on request — resolver/cache invariant broken');
            }
            return reply.code(500).send({
                error: "Server configuration error: tenant features not available",
                code: "INTERNAL_MISCONFIG"
            });
        }

        // Step 3 (AUDIT_6): features === null → tenant not configured; all storefront endpoints return 503
        if (tenantContext.features === null) {
            const reqLog = (req as { log?: { warn: (o: object, msg: string) => void } }).log;
            if (reqLog) {
                reqLog.warn({
                    tenantId: tenant.id,
                    tenantSlug: tenant.slug,
                    event: 'TENANT_NOT_CONFIGURED'
                }, 'Tenant features not configured — 503');
            }
            return reply.code(503).send({
                error: "Tenant not configured",
                code: "TENANT_NOT_CONFIGURED"
            });
        }

        // Metrics: Track resolution duration
        const duration = (Date.now() - startTime) / 1000;
        tenantResolutionDuration.observe(duration);

        // Track cache hit/miss (implicit based on performance)
        if (duration < 0.005) { // < 5ms = likely cache hit
            tenantCacheHits.inc({ tenant_id: tenant.id });
        } else {
            tenantCacheMisses.inc();
        }

        // Logging: Request-scoped logger
        // Fastify runtime-decorated logger
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reqLog = (req as any).log;
        if (reqLog) {
            reqLog.debug({
                hostname,
                tenantId: tenant.id,
                tenantSlug: tenant.slug,
                tenantType: type,
                durationMs: duration * 1000
            }, 'Tenant resolved');
        }
    });
}

export function validateTenant(req: FastifyRequest): { id: string; name: string; slug: string } {
    if (!req.tenant || !req.tenant.id) {
        throw { statusCode: 400, error: "Tenant context required", code: "MISSING_TENANT_CONTEXT" };
    }
    return req.tenant;
}
