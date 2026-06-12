/**
 * Internal API Routes
 * 
 * Protected endpoints for internal service communication
 * Used by Next.js middleware for tenant resolution
 * 
 * Security: All endpoints require x-internal-secret header
 */

import { FastifyPluginAsync } from 'fastify';
import { prisma } from '@vendora/database';
import { resolveTenant } from '../../services/tenant-resolver.js';
import { isValidInternalSecret } from '../../lib/internal-auth.js';

const internalRoutes: FastifyPluginAsync = async (app) => {
    /**
     * Resolve tenant from domain
     * 
     * Used by Next.js middleware to determine which tenant to serve
     * Returns minimal tenant info for performance
     * 
     * Security: Protected by INTERNAL_API_SECRET (timing-safe comparison)
     * 
     * @query domain - Domain to resolve (example.com or tenant.vendora.local)
     * @returns { tenantId, slug, name, type }
     */
    app.get('/internal/resolve-tenant', async (req, reply) => {
        // 🔒 Security Check - Timing-Safe Secret Comparison
        if (!isValidInternalSecret(req)) {
            app.log.warn({
                ip: req.ip,
                event: 'UNAUTHORIZED_INTERNAL_API_ACCESS',
                reason: 'Invalid secret'
            }, 'Unauthorized internal API access attempt');

            return reply.code(403).send({ error: 'Forbidden' });
        }



        // Validate query params
        const { domain } = req.query as { domain?: string };

        if (!domain || typeof domain !== 'string') {
            return reply.code(400).send({
                error: 'Invalid domain parameter',
                message: 'domain query parameter is required'
            });
        }

        // Resolve tenant (uses CacheManager from Phase 4)
        try {
            const result = await resolveTenant(prisma, domain);

            if (!result) {
                // Tenant not found - log for monitoring
                app.log.debug({ domain, event: 'TENANT_NOT_FOUND' },
                    'Tenant resolution failed');

                return reply.code(404).send({
                    error: 'Tenant not found'
                });
            }

            // Log successful resolution (debug level)
            app.log.debug({
                domain,
                tenantId: result.tenant.id,
                tenantSlug: result.tenant.slug,
                type: result.type,
                event: 'TENANT_RESOLVED'
            }, 'Tenant resolved successfully');

            const defaultBranchSlug = result.tenant.defaultBranch?.slug ?? null;
            const hasDefaultBranch = Boolean(defaultBranchSlug);
            const mode = hasDefaultBranch ? "default" : "chooser";

            // Return minimal payload for performance
            return {
                tenantId: result.tenant.id,
                slug: result.tenant.slug,
                name: result.tenant.name,
                type: result.type, // 'subdomain' | 'custom'
                mode,
                ...(mode === "default" && defaultBranchSlug ? { branchSlug: defaultBranchSlug } : {})
            };

        } catch (error: unknown) {
            const err = error instanceof Error ? error : new Error(String(error));
            app.log.error({
                domain,
                error: err.message,
                stack: err.stack,
                event: 'INTERNAL_API_ERROR'
            }, 'Internal API error during tenant resolution');

            return reply.code(500).send({
                error: 'Internal server error'
            });
        }
    });
};

export default internalRoutes;
