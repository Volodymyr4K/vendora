/**
 * Tenant Resolver - Multi-tenancy resolution with dual-LRU caching
 * 
 * Supports:
 * - Base domain subdomains (tenant.vendora.local)
 * - Custom domains (example.com)
 * - Ghost domain protection
 * - O(1) cache lookups
 * - Theme from Tenant.settings (audit 3.4, plan 1.3)
 */

import type { Prisma, PrismaClient } from '@vendora/database';
import { zMainTemplateId, zThemeV1, zAmContentV1, type MainTemplateId } from '@vendora/contracts';
import { normalizeDomain } from '@vendora/tenant-resolver';
import { cacheManager, type CachedTenant } from './cache-manager.js';
import { normalizeToResolvedTheme } from './theme.js';

// Single-flight: prevent tenant-resolution stampedes on cold start / after deploy.
// - L1 inflight keyed by normalized domain (domain → tenantId)
// - L2 inflight keyed by tenantId (tenantId → tenant data)
const inflightTenantIdByDomain = new Map<string, Promise<string | null>>();
const inflightTenantById = new Map<string, Promise<CachedTenant | null>>();

// DomainStatus enum values (from Prisma schema)
const DomainStatus = {
    PENDING: 'PENDING' as const,
    VERIFIED: 'VERIFIED' as const,
    FAILED: 'FAILED' as const
};

/** Explicit select for tenant cache (both L1 subdomain and L2 miss). Single source so fields cannot drift (audit 3.4). Typed so schema changes are caught. */
const TENANT_SELECT_FOR_CACHE = {
    id: true,
    slug: true,
    name: true,
    isActive: true,
    customDomainsEnabled: true,
    branchesMode: true,
    defaultBranchId: true,
    defaultBranch: { select: { slug: true } },
    countryCode: true,
    currency: true,
    timezone: true,
    features: true,
    settings: true,
} as const satisfies Prisma.TenantSelect;

/**
 * Parse settings.theme → ResolvedTheme.
 * Never throws: missing/invalid → normalizeToResolvedTheme(null) → DEFAULT_RESOLVED_THEME (audit 3.4).
 */
function themeFromSettings(settings: unknown): ReturnType<typeof normalizeToResolvedTheme> {
    const raw = (settings as Record<string, unknown> | null)?.theme;
    const parsed = zThemeV1.safeParse(raw);
    return normalizeToResolvedTheme(parsed.success ? parsed.data : null);
}

/**
 * Parse settings.mainTemplate → MainTemplateId.
 * Never throws: missing/invalid → "default".
 */
function mainTemplateFromSettings(settings: unknown): MainTemplateId {
    const raw = (settings as Record<string, unknown> | null)?.mainTemplate;
    const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
    const parsed = zMainTemplateId.safeParse(normalized);
    return parsed.success ? parsed.data : "default";
}
export interface TenantResolutionResult {
    tenant: CachedTenant;
    type: 'subdomain' | 'custom';
}

/**
 * Resolve tenant from domain with caching
 * Unified logic for both subdomains and custom domains
 */
export async function resolveTenant(
    prisma: PrismaClient,
    rawDomain: string
): Promise<TenantResolutionResult | null> {

    const domain = normalizeDomain(rawDomain);
    const BASE_DOMAIN = process.env.BASE_DOMAIN || 'vendora.local';

    // Check if feature is enabled globally
    if (!process.env.CUSTOM_DOMAINS_ENABLED && !domain.endsWith(`.${BASE_DOMAIN}`)) {
        return null; // Custom domains globally disabled
    }

    // Determine if subdomain or custom domain
    const isSubdomain = domain.endsWith(`.${BASE_DOMAIN}`);
    const slug = isSubdomain ? domain.replace(`.${BASE_DOMAIN}`, '') : null;

    // L1: domain → tenantId lookup (unified for both types)
    let tenantId = cacheManager.getTenantId(domain);

    if (!tenantId) {
        const existing = inflightTenantIdByDomain.get(domain);
        if (existing) {
            tenantId = (await existing) ?? undefined;
        } else {
            const p: Promise<string | null> = (async () => {
                try {
                    // L1 miss - lookup in database
                    if (isSubdomain && slug) {
                        // Subdomain: explicit select (TENANT_SELECT_FOR_CACHE) so settings (theme) cannot be dropped (audit 3.4)
                        const tenant = await prisma.tenant.findUnique({
                            where: { slug, isActive: true },
                            select: TENANT_SELECT_FOR_CACHE,
                        });

                        if (!tenant) {
                            return null; // Subdomain not found
                        }

                        const resolvedTenantId = tenant.id;

                        // Cache subdomain mapping
                        cacheManager.setTenantId(domain, resolvedTenantId);

                        // Cache tenant data if not already cached (theme from settings; audit 3.4)
                        if (!cacheManager.getTenant(resolvedTenantId)) {
                            const theme = themeFromSettings(tenant.settings);
                            const mainTemplate = mainTemplateFromSettings(tenant.settings);
                            const amContent = zAmContentV1.safeParse((tenant.settings as Record<string, unknown> | null | undefined)?.amContent).success
                                ? (tenant.settings as Record<string, unknown>)?.amContent
                                : undefined;
                            cacheManager.setTenant(resolvedTenantId, {
                                id: tenant.id,
                                slug: tenant.slug,
                                name: tenant.name,
                                isActive: tenant.isActive,
                                customDomainsEnabled: tenant.customDomainsEnabled,
                                branchesMode: tenant.branchesMode,
                                defaultBranchId: tenant.defaultBranchId ?? null,
                                defaultBranch: tenant.defaultBranch ?? null,
                                countryCode: tenant.countryCode,
                                currency: tenant.currency,
                                timezone: tenant.timezone,
                                features: tenant.features as CachedTenant['features'],
                                theme,
                                mainTemplate,
                                amContent,
                                customDomains: []
                            });
                        }

                        return resolvedTenantId;
                    }

                    // Custom domain: lookup in CustomDomain table (VERIFIED only)
                    const customDomain = await prisma.customDomain.findFirst({
                        where: { domain, status: DomainStatus.VERIFIED },
                        select: { tenantId: true, domain: true, status: true }
                    });

                    if (!customDomain) {
                        return null; // Custom domain not found or not VERIFIED
                    }

                    const resolvedTenantId = customDomain.tenantId;
                    // Only cache VERIFIED domains (customDomain exists only if VERIFIED)
                    cacheManager.setTenantId(domain, resolvedTenantId);
                    return resolvedTenantId;
                } finally {
                    inflightTenantIdByDomain.delete(domain);
                }
            })();

            inflightTenantIdByDomain.set(domain, p);
            tenantId = (await p) ?? undefined;
        }

        if (!tenantId) {
            return null;
        }
    }

    // L2: tenantId → tenant data lookup
    let tenant = cacheManager.getTenant(tenantId);

    if (!tenant) {
        const existing = inflightTenantById.get(tenantId);
        if (existing) {
            tenant = (await existing) ?? undefined;
        } else {
            const p: Promise<CachedTenant | null> = (async () => {
                try {
                    // L2 miss: same scalar select + customDomains; where isActive so we never cache inactive tenants (audit 3.4)
                    const dbTenant = await prisma.tenant.findUnique({
                        where: { id: tenantId, isActive: true },
                        select: {
                            ...TENANT_SELECT_FOR_CACHE,
                            customDomains: {
                                where: { status: DomainStatus.VERIFIED },
                                select: { domain: true, status: true },
                            },
                        },
                    });

                    if (!dbTenant || !dbTenant.isActive) {
                        return null;
                    }

                    // Cache tenant data (theme from settings; audit 3.4)
                    const theme = themeFromSettings(dbTenant.settings);
                    const mainTemplate = mainTemplateFromSettings(dbTenant.settings);
                    const amContent = zAmContentV1.safeParse((dbTenant.settings as Record<string, unknown> | null | undefined)?.amContent).success
                        ? (dbTenant.settings as Record<string, unknown>)?.amContent
                        : undefined;

                    const resolvedTenant: CachedTenant = {
                        id: dbTenant.id,
                        slug: dbTenant.slug,
                        name: dbTenant.name,
                        isActive: dbTenant.isActive,
                        customDomainsEnabled: dbTenant.customDomainsEnabled,
                        branchesMode: dbTenant.branchesMode,
                        defaultBranchId: dbTenant.defaultBranchId ?? null,
                        defaultBranch: dbTenant.defaultBranch ?? null,
                        countryCode: dbTenant.countryCode,
                        currency: dbTenant.currency,
                        timezone: dbTenant.timezone,
                        features: dbTenant.features as CachedTenant['features'],
                        theme,
                        mainTemplate,
                        amContent,
                        customDomains: dbTenant.customDomains
                    };

                    cacheManager.setTenant(tenantId, resolvedTenant);
                    return resolvedTenant;
                } finally {
                    inflightTenantById.delete(tenantId);
                }
            })();

            inflightTenantById.set(tenantId, p);
            tenant = (await p) ?? undefined;
        }

        if (!tenant || !tenant.isActive) {
            // Tenant not found or inactive (L2 null when isActive:true filters out deactivated tenant). Clear L1 so next request L1-misses and re-resolves (no negative cache).
            cacheManager.invalidateDomain(domain);
            return null;
        }

        // 🔥 GHOST DOMAIN PROTECTION (for custom domains only)
        if (!isSubdomain) {
            const domainBelongsToTenant = tenant.customDomains.some(
                d => d.domain === domain && d.status === DomainStatus.VERIFIED
            );

            if (!domainBelongsToTenant) {
                // Domain was deleted! Clear ghost mapping
                console.warn(`Ghost domain detected: ${domain} → ${tenantId}`);
                cacheManager.invalidateDomain(domain);
                return null;
            }

            // Feature gate check for custom domains
            if (!tenant.customDomainsEnabled) {
                return null; // Custom domains disabled for this tenant
            }
        }
    }

    return {
        tenant,
        type: isSubdomain ? 'subdomain' : 'custom'
    };
}
