import fp from "fastify-plugin";
import { FastifyRequest, FastifyReply } from "fastify";
import { UnauthorizedError, ForbiddenError } from "../errors/business-error.js";

interface AuthOptions {
    role?: "admin" | "super-admin" | "customer"; // Optional Role requirement
    requireTenant?: boolean;        // Enforce tenant context
}

export const authPlugin = fp<AuthOptions>(async (app, opts) => {
    app.addHook("onRequest", async (req: FastifyRequest, _reply: FastifyReply) => {
        try {
            // 1. Verify Token Signature
            await req.jwtVerify();
        } catch (err) {
            throw new UnauthorizedError("Invalid or expired token");
        }

        if (opts.role && req.user.role !== opts.role) {
            const userRole = req.user.role as string;

            // Allow case-insensitive match for SUPER_ADMIN vs super-admin
            const isSuperAdmin = userRole === 'super-admin' || userRole === 'SUPER_ADMIN';
            const requiredIsSuperAdmin = opts.role === 'super-admin';

            // Special handling for Customer vs Admin separation
            if (opts.role === 'customer' && userRole !== 'customer') {
                throw new ForbiddenError(`Access denied. Customer access only.`);
            }

            if (requiredIsSuperAdmin) {
                if (!isSuperAdmin) {
                    throw new ForbiddenError(`Access denied. Required role: ${opts.role}, verify your role (got: ${userRole})`);
                }
            } else {
                // If requiring 'admin', 'super-admin' usually overrides.
                // If requiring 'customer', super-admin usually DOES NOT override (separate contexts), unless debugging.
                const isOverride = isSuperAdmin && opts.role !== 'customer';

                if ((userRole as string) !== (opts.role as string) && !isOverride) {
                    throw new ForbiddenError(`Access denied. Required role: ${opts.role} (got: ${userRole})`);
                }
            }
        }

        // 3. Populate Context based on Role
        if (req.user.role === 'customer') {
            const tenantId = req.user.tenantId ?? '';
            req.customer = {
                id: req.user.userId,
                // JWT payload phone field - defined in token but not in base type
                phone: (req.user as { phone?: string }).phone ?? '',
                tenantId,
            };
        }

        // 3. Enforce Tenant if required
        if (opts.requireTenant && !req.tenant) {
            throw new ForbiddenError("Tenant context required for this route");
        }

        // ACCESS_LEVELS Phase 2: populate adminContext from JWT. Phase 3.5: allowedBranchIds — fail-closed: absent (old token) → [] so branch-scope guard denies; present null = all branches, array = those branches.
        if (opts.requireTenant && req.tenant && req.user.tenantId) {
            const role = req.user.role as string;
            if (role === "TENANT_OWNER" || role === "TENANT_ADMIN") {
                const raw = (req.user as { permissions?: Record<string, { canView: boolean; canEdit: boolean; allowedBranchIds?: string[] | null }> }).permissions ?? null;
                // ACCESS_LEVELS: normalize canEdit ⇒ canView once (plan 0.3); same as loadTenantAdminContext.
                const permissions = raw
                    ? Object.fromEntries(
                          Object.entries(raw).map(([k, p]) => [
                              k,
                              {
                                  canView: p.canView || p.canEdit,
                                  canEdit: p.canEdit,
                                  allowedBranchIds: p.allowedBranchIds !== undefined ? p.allowedBranchIds : [],
                              },
                          ])
                      )
                    : null;
                req.adminContext = {
                    tenantId: req.user.tenantId,
                    role,
                    permissions,
                };
            }
        }

        // Tenant mismatch: canonical check is in tenantGuardPlugin (single place for 403 + metrics/log).
        // Here we only enforce requireTenant; mismatch is handled by tenantGuard.
    });
});
