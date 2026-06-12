import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@vendora/database";
import { tenantMismatchErrors } from "../lib/metrics.js";

/**
 * Tenant Guard Plugin
 * 
 * Enforces tenant lifecycle controls by checking `Tenant.isActive` status.
 * This plugin is ONLY registered in Layer 4 (tenant-protected routes).
 * 
 * JWT verification is handled by the parent scope, so we can assume
 * req.user is already populated.
 * 
 * CRITICAL: This plugin validates JWT tenantId AGAINST req.tenant.id
 * req.tenant.id is the SINGLE SOURCE OF TRUTH (from x-tenant-slug header)
 */

interface TenantGuardOptions {
    prisma: PrismaClient;
}

export async function tenantGuardPlugin(
    app: FastifyInstance,
    _opts: TenantGuardOptions
) {
    // const { prisma } = opts;

    app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
        // JWT is already verified by parent scope (Layer 4 in index.ts)
        // Fastify runtime-decorated user from JWT
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const user = (req as any).user;

        if (!user || !user.tenantId) {
            return reply.code(403).send({
                error: "JWT missing tenantId",
                code: "INVALID_JWT"
            });
        }

        // CRITICAL: req.tenant is the SINGLE SOURCE OF TRUTH
        // It is set by tenant-context plugin from x-tenant-slug header
        if (!req.tenant || !req.tenant.id) {
            return reply.code(400).send({
                error: "Tenant context required",
                code: "MISSING_TENANT_CONTEXT"
            });
        }

        // SECURITY: Validate JWT tenantId matches header-resolved tenant
        if (user.tenantId !== req.tenant.id) {
            // Metrics: Track security event - confused deputy attempt
            tenantMismatchErrors.inc({
                user_id: user.userId || 'unknown',
                jwt_tenant_id: user.tenantId,
                header_tenant_id: req.tenant.id
            });

            // Logging: Security event with full context
            // Fastify runtime-decorated logger
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
                if (reqLog) {
                    reqLog.warn({
                        securityEvent: 'TENANT_MISMATCH',
                        userId: user.userId,
                        jwtTenantId: user.tenantId,
                        headerTenantId: req.tenant.id,
                        url: (req.url ?? "").split("?")[0] ?? "",
                        method: req.method
                    }, 'JWT tenant mismatch - potential confused deputy attack');
                }

            return reply.code(403).send({
                error: "Tenant mismatch",
                code: "FORBIDDEN",
                message: "You do not have access to this tenant"
            });
        }

        // Check tenant isActive status using req.tenant.id (NOT user.tenantId)
        if (!req.tenant.isActive) {
            // Fastify runtime-decorated logger
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
            if (reqLog) {
                reqLog.warn({
                    securityEvent: 'INACTIVE_TENANT_ACCESS',
                    tenantId: req.tenant.id,
                    tenantName: req.tenant.name,
                    userId: user.userId
                }, 'Blocked inactive tenant access attempt');
            }

            return reply.code(403).send({
                error: "Subscription suspended",
                message: "Your account has been temporarily suspended. Please contact support."
            });
        }

        // Tenant is active and JWT matches - continue
    });
}

/**
 * Helper to manually validate tenant context in a route handler
 * useful for public routes that need tenant context but not full auth
 */
import { TenantContext } from "./tenant-context.js";

// Helper to manually validate tenant
export function validateTenant(req: FastifyRequest): TenantContext {
    if (!req.tenant || !req.tenant.id) {
        throw { statusCode: 400, error: "Tenant context required", code: "MISSING_TENANT_CONTEXT" };
    }
    return req.tenant;
}
