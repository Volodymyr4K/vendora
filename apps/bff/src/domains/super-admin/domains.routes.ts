/**
 * Domain Management API Routes
 *
 * Super Admin endpoints for managing custom domains and tenant theme.
 * Mounted at /super/tenants (prefix) → /:tenantId/domains, /:tenantId/theme
 */

import { FastifyPluginAsync, FastifyRequest as _FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma, Prisma, DomainStatus } from '@vendora/database';
import { zAmContentV1, zThemeV1 } from '@vendora/contracts';
import { validateCustomDomain, normalizeDomain } from '@vendora/tenant-resolver';
import { generateTxtRecord } from '@vendora/tenant-resolver/dns';
import { createDomainProvider } from '../../services/domain-provider/factory.js';
import { verifyAndActivate } from '../../services/domain-verification.js';
import { cacheManager } from '../../services/cache-manager.js';
import {
  buildCanonicalThemeV1ForStorage,
  isThemeNonEmpty,
  isStoredThemeWithinSizeLimit,
  validateBrandUrls,
} from '../../services/theme.js';
import { logger } from '../../lib/logger.js';

type ThemeRejectReason =
  | 'invalid_id'
  | 'tenant_not_found'
  | 'unknown_keys'
  | 'invalid_payload';

const domainsRoutes: FastifyPluginAsync = async (app) => {
  const docsBaseUrl = String(process.env.DOCS_BASE_URL || 'https://docs.vendora.com').replace(/\/$/, '');

  // ========================================
  // PATCH /:tenantId/am-content (super-admin)
  // ========================================
  // Safe super-admin-only path for updating tenant.settings.amContent when tenant-admin JWT is unavailable.
  // Strictly validated with zAmContentV1; updates ONLY settings.amContent and invalidates tenant cache.
  app.patch<{
    Params: { tenantId: string };
    Body: unknown;
  }>('/:tenantId/am-content', {
    schema: {},
  }, async (req, reply) => {
    const { tenantId } = req.params;
    const requestId = String(req.id ?? '');
    const adminId = (req.user as { userId?: string } | undefined)?.userId ?? '';

    reply.header('Cache-Control', 'private, no-store');

    const uuidParse = z.string().uuid().safeParse(tenantId);
    if (!uuidParse.success) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'invalid_id',
        status: 400,
      }, 'PATCH amContent rejected: invalid tenant id');
      return reply.code(400).send({ error: 'invalid_id' });
    }

    const parsedBody = z.object({ amContent: zAmContentV1.nullable() }).strict().safeParse(req.body);
    if (!parsedBody.success) {
      const reason = parsedBody.error.issues.some((i) => (i as { code?: string }).code === 'unrecognized_keys')
        ? 'unknown_keys'
        : 'invalid_payload';
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason,
        status: 400,
      }, 'PATCH amContent rejected');
      return reply.code(400).send({ error: reason });
    }

    const amContent = parsedBody.data.amContent;
    const valueJson = Prisma.sql`${JSON.stringify(amContent)}`;
    const count = await prisma.$executeRaw(
      Prisma.sql`
        UPDATE "Tenant"
        SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{amContent}', (${valueJson})::jsonb)
        WHERE id = ${tenantId}
      `
    );

    if (count === 0) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'tenant_not_found',
        status: 404,
      }, 'PATCH amContent rejected: tenant not found');
      return reply.code(404).send({ error: 'tenant_not_found' });
    }

    cacheManager.invalidateTenant(tenantId);
    logger.info({
      adminId,
      tenantId,
      requestId,
      timestamp: new Date().toISOString(),
    }, 'PATCH amContent committed');

    return reply.send({ amContent });
  });

  // ========================================
  // PATCH /:tenantId/theme (audit 3.9 F)
  // ========================================

  // Body parsed in handler with zThemeV1.strict() to return allowlist reason (unknown_keys vs invalid_payload).
  app.patch<{
    Params: { tenantId: string };
    Body: unknown;
  }>('/:tenantId/theme', {
    schema: {},
  }, async (req, reply) => {
    const { tenantId } = req.params;
    const requestId = String(req.id ?? '');
    const adminId = (req.user as { userId?: string } | undefined)?.userId ?? '';

    reply.header('Cache-Control', 'private, no-store');

    const uuidParse = z.string().uuid().safeParse(tenantId);
    if (!uuidParse.success) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'invalid_id' as ThemeRejectReason,
        status: 400,
      }, 'PATCH theme rejected: invalid tenant id');
      return reply.code(400).send({ error: 'invalid_id' });
    }

    const parsed = zThemeV1.strict().safeParse(req.body);
    if (!parsed.success) {
      const reason: ThemeRejectReason = parsed.error.issues.some(
        (i) => (i as { code?: string }).code === 'unrecognized_keys'
      )
        ? 'unknown_keys'
        : 'invalid_payload';
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason,
        status: 400,
      }, 'PATCH theme rejected');
      return reply.code(400).send({ error: reason });
    }

    const body = parsed.data;
    if (!isThemeNonEmpty(body)) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'invalid_payload' as ThemeRejectReason,
        status: 400,
      }, 'PATCH theme rejected: non-empty required');
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    if (!validateBrandUrls(body.brand)) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'invalid_payload' as ThemeRejectReason,
        status: 400,
      }, 'PATCH theme rejected: brand URL invalid (https only, no ip-literals, no private IP)');
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const canonicalTheme = buildCanonicalThemeV1ForStorage(body);
    // 16KB enforcement: size-check after canonicalize, on canonical theme, in UTF-8 bytes
    if (!isStoredThemeWithinSizeLimit(canonicalTheme)) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'invalid_payload' as ThemeRejectReason,
        status: 400,
      }, 'PATCH theme rejected: size over 16KB');
      return reply.code(400).send({ error: 'invalid_payload' });
    }

    const themeJson = JSON.stringify(canonicalTheme);
    const count = await prisma.$executeRaw(
      Prisma.sql`UPDATE "Tenant" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{theme}', (${themeJson})::jsonb) WHERE id = ${tenantId}`
    );

    if (count === 0) {
      logger.warn({
        adminId,
        tenantId,
        requestId,
        reason: 'tenant_not_found' as ThemeRejectReason,
        status: 404,
      }, 'PATCH theme rejected: tenant not found');
      return reply.code(404).send({ error: 'tenant_not_found' });
    }

    cacheManager.invalidateTenant(tenantId);
    logger.info({
      adminId,
      tenantId,
      requestId,
      timestamp: new Date().toISOString(),
    }, 'PATCH theme committed');

    reply.header('Cache-Control', 'private, no-store');
    return reply.code(204).send();
  });

  // ========================================
  // GET /:tenantId/domains
    // List all custom domains for a tenant
    // ========================================

    app.get<{
        Params: { tenantId: string };
    }>('/:tenantId/domains', {
        schema: {
            params: z.object({
                tenantId: z.string().uuid()
            })
        }
    }, async (req, reply) => {
        const { tenantId } = req.params;

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        const domains = await prisma.customDomain.findMany({
            where: { tenantId },
            orderBy: { createdAt: 'desc' }
        });

        return {
            domains: domains.map(d => ({
                id: d.id,
                domain: d.domain,
                status: d.status,
                provider: d.provider,
                isWildcard: d.isWildcard,
                txtRecord: d.txtRecord,
                cnameTarget: d.cnameTarget,
                createdAt: d.createdAt,
                verifiedAt: d.verifiedAt,
                lastVerifiedAt: d.lastVerifiedAt
            }))
        };
    });

    // ========================================
    // POST /:tenantId/domains
    // Create new custom domain
    // CRITICAL: Calls provider.addDomain() here
    // Rate limited: 10 domains/hour per tenant
    // ========================================

    app.post<{
        Params: { tenantId: string };
        Body: {
            domain: string;
            provider: 'vercel' | 'cloudflare' | 'custom';
            customCnameTarget?: string;
            isWildcard?: boolean;
        };
    }>('/:tenantId/domains', {
        schema: {
            params: z.object({
                tenantId: z.string().uuid()
            }),
            body: z.object({
                domain: z.string().min(1),
                provider: z.enum(['vercel', 'cloudflare', 'custom']),
                customCnameTarget: z.string().optional(),
                isWildcard: z.boolean().optional()
            })
        },
        config: {
            rateLimit: {
                max: 10,
                timeWindow: '1 hour',
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                keyGenerator: (req: any) => `domain-create:${req.params.tenantId}`
            }
        }
    }, async (req, reply) => {
        const { tenantId } = req.params;
        const { domain: rawDomain, provider, customCnameTarget, isWildcard } = req.body;

        const domain = normalizeDomain(rawDomain);

        const validation = validateCustomDomain(domain);
        if (!validation.valid) {
            return reply.code(400).send({
                error: 'Invalid domain',
                details: validation.error
            });
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId }
        });

        if (!tenant) {
            return reply.code(404).send({ error: 'Tenant not found' });
        }

        if (!tenant.customDomainsEnabled) {
            return reply.code(403).send({
                error: 'Custom domains not enabled for this tenant'
            });
        }

        const existing = await prisma.customDomain.findUnique({
            where: { domain }
        });

        if (existing) {
            return reply.code(409).send({
                error: 'Domain already exists',
                code: 'DOMAIN_ALREADY_EXISTS'
            });
        }

        const txtRecord = generateTxtRecord(tenantId, domain);

        // Call provider.addDomain() DURING CREATION
        const domainProvider = createDomainProvider(provider);
        let providerResult;
        let cnameTarget = customCnameTarget;

        try {
            providerResult = await domainProvider.addDomain({ domain });

            if (providerResult.requiredRecords) {
                const cnameRecord = providerResult.requiredRecords.find(
                    r => r.type === 'CNAME' || r.type === 'A'
                );
                if (cnameRecord) {
                    cnameTarget = cnameRecord.value;
                }
            }
        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            app.log.error({
                domain,
                provider,
                error: err.message,
                stack: err.stack
            }, 'Provider addDomain failed');

            return reply.code(500).send({
                error: 'Failed to register domain with provider',
                details: err.message,
                helpUrl: `${docsBaseUrl}/domains/troubleshooting#provider-errors`
            });
        }

        const customDomain = await prisma.customDomain.create({
            data: {
                domain,
                tenantId,
                provider,
                providerDomainId: providerResult.providerId || null,
                status: DomainStatus.PENDING,
                txtRecord,
                cnameTarget: cnameTarget || null,
                isWildcard: isWildcard || false
            }
        });

        // Invalidate immediately after write so cache is correct even if audit log / reply fails (audit 3.9 D)
        cacheManager.invalidateDomain(domain);
        cacheManager.invalidateTenant(tenantId);

        // Audit log (secondary; must not break endpoint — domain created and cache invalidated already)
        const { logAudit, getUserContext } = await import('../../services/audit-logger.js');
        try {
            const userContext = getUserContext(req);
            await logAudit({
                action: 'domain_added',
                tenantId,
                domainId: customDomain.id,
                domain,
                metadata: { provider, isWildcard },
                ...userContext
            });
        } catch (auditErr) {
            app.log.warn({ err: auditErr, tenantId, domain }, 'Audit log failed after domain create; responding 201');
        }

        return reply.code(201).send({
            domain: customDomain,
            dnsInstructions: {
                txtRecord: {
                    type: 'TXT',
                    name: '@',
                    value: txtRecord,
                    description: 'Ownership verification'
                },
                cnameRecord: cnameTarget ? {
                    type: 'CNAME',
                    name: isWildcard ? '*' : '@',
                    value: cnameTarget,
                    description: 'Points to infrastructure'
                } : null,
                additionalRecords: providerResult.requiredRecords || []
            }
        });
    });

    // ========================================
    // POST /:tenantId/domains/:domainId/verify
    // Trigger DNS verification (idempotent)
    // Rate limited: 5 attempts/minute per IP
    // ========================================

    app.post<{
        Params: { tenantId: string; domainId: string };
    }>('/:tenantId/domains/:domainId/verify', {
        schema: {
            params: z.object({
                tenantId: z.string().uuid(),
                domainId: z.string().uuid()
            })
        },
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '1 minute'
            }
        }
    }, async (req, reply) => {
        const { tenantId, domainId } = req.params;

        const domain = await prisma.customDomain.findFirst({
            where: { id: domainId, tenantId }
        });

        if (!domain) {
            return reply.code(404).send({ error: 'Domain not found' });
        }

        if (domain.status === DomainStatus.VERIFIED) {
            return {
                success: true,
                message: 'Domain already verified',
                domain: {
                    id: domain.id,
                    domain: domain.domain,
                    status: domain.status,
                    verifiedAt: domain.verifiedAt
                }
            };
        }

        // Audit log verification attempt
        const { logAudit, getUserContext } = await import('../../services/audit-logger.js');
        const userContext = getUserContext(req);

        const result = await verifyAndActivate(prisma, tenantId, domainId);

        if (result.success) {
            await logAudit({
                action: 'domain_verified',
                tenantId,
                domainId,
                domain: domain.domain,
                ...userContext
            });

            return {
                success: true,
                message: 'Domain verified successfully',
                domain: result.domain
            };
        } else {
            await logAudit({
                action: 'domain_verification_attempted',
                tenantId,
                domainId,
                domain: domain.domain,
                metadata: { error: result.error },
                ...userContext
            });

            return reply.code(400).send({
                success: false,
                error: result.error,
                details: 'DNS verification failed. Check TXT and CNAME records.',
                helpUrl: `${docsBaseUrl}/domains/troubleshooting`
            });
        }
    });

    // ========================================
    // PATCH /:tenantId/domains/:domainId
    // Update domain configuration
    // ========================================

    app.patch<{
        Params: { tenantId: string; domainId: string };
        Body: {
            isWildcard?: boolean;
            customCnameTarget?: string;
        };
    }>('/:tenantId/domains/:domainId', {
        schema: {
            params: z.object({
                tenantId: z.string().uuid(),
                domainId: z.string().uuid()
            }),
            body: z.object({
                isWildcard: z.boolean().optional(),
                customCnameTarget: z.string().optional()
            })
        }
    }, async (req, reply) => {
        const { tenantId, domainId } = req.params;
        const { isWildcard, customCnameTarget } = req.body;

        const domain = await prisma.customDomain.findFirst({
            where: { id: domainId, tenantId }
        });

        if (!domain) {
            return reply.code(404).send({ error: 'Domain not found' });
        }

        const updateRes = await prisma.customDomain.updateMany({
            where: { id: domainId, tenantId },
            data: {
                isWildcard: isWildcard ?? domain.isWildcard,
                cnameTarget: customCnameTarget ?? domain.cnameTarget
            }
        });

        if (updateRes.count === 0) {
            return reply.code(404).send({ error: 'Domain not found' });
        }

        const updated = await prisma.customDomain.findFirst({
            where: { id: domainId, tenantId }
        });

        if (!updated) {
            return reply.code(404).send({ error: 'Domain not found' });
        }

        return { domain: updated };
    });

    // ========================================
    // DELETE /:tenantId/domains/:domainId
    // Remove custom domain
    // CRITICAL: Calls provider.removeDomain()
    // ========================================

    app.delete<{
        Params: { tenantId: string; domainId: string };
    }>('/:tenantId/domains/:domainId', {
        schema: {
            params: z.object({
                tenantId: z.string().uuid(),
                domainId: z.string().uuid()
            })
        }
    }, async (req, reply) => {
        const { tenantId, domainId } = req.params;

        const domain = await prisma.customDomain.findFirst({
            where: { id: domainId, tenantId }
        });

        if (!domain) {
            return reply.code(404).send({ error: 'Domain not found' });
        }

        const domainProvider = createDomainProvider(domain.provider ?? undefined);

        if (domain.providerDomainId) {
            try {
                await domainProvider.removeDomain(domain.providerDomainId);
            } catch (error: unknown) {
                const err = error instanceof Error ? error : new Error(String(error));
                app.log.error({
                    domainId,
                    provider: domain.provider,
                    error: err.message,
                    stack: err.stack
                }, 'Provider removeDomain failed (non-blocking)');
            }
        }

        const deleteRes = await prisma.customDomain.deleteMany({
            where: { id: domainId, tenantId }
        });

        if (deleteRes.count !== 1) {
            return reply.code(404).send({ error: 'Domain not found' });
        }

        // Post-commit: invalidate L1 + L2 (no $transaction here; if added later, keep invalidation outside it — audit 3.9 D)
        const removedDomain = domain.domain;
        cacheManager.invalidateDomain(removedDomain);
        cacheManager.invalidateTenant(tenantId);

        return { success: true, message: 'Domain deleted' };
    });
};

export default domainsRoutes;
