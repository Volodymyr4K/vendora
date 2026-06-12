import type { FastifyInstance } from "fastify";
import type { AuthDependencies } from "../../types/dependencies.js";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { validateTenant } from "../../plugins/tenant-guard.js";
import { loadTenantAdminContext } from "../../lib/admin-context.js";

const zLoginRequest = z.object({
    username: z.string(),
    password: z.string(),
});

// ACCESS_LEVELS: admin JWT TTL (stale permissions mitigation)
const ADMIN_JWT_EXPIRES_IN = "12h";
const ADMIN_JWT_COOKIE_MAX_AGE_SEC = 12 * 60 * 60;

// JWT Payload: ACCESS_LEVELS Phase 2 — role/activeTenantId from TenantUser; permissions for TENANT_ADMIN. Phase 3.5: allowedBranchIds.
interface JWTPayload {
    role: string;
    username: string;
    userId: string;
    tenantId?: string;
    activeTenantId?: string;
    permissions?: Record<string, { canView: boolean; canEdit: boolean; allowedBranchIds: string[] | null }>;
}

export async function routesAuth(app: FastifyInstance, deps: AuthDependencies) {
    // POST /auth/login - Tenant Admin Login
    // SECURITY: Aggressive rate limiting to prevent brute force attacks
    app.post<{ Body: z.infer<typeof zLoginRequest> }>("/auth/login", {
        schema: {
            body: zLoginRequest
        },
        config: {
            rateLimit: {
                max: 5,              // 5 attempts
                timeWindow: '15 minutes',  // per 15 minutes
                keyGenerator: (req) => {
                    // Rate limit by IP to prevent credential stuffing
                    return `login:${req.ip}`;
                }
            }
        }
    }, async (req, reply) => {
        const body = req.body;
        const tenant = validateTenant(req);

        const user = await deps.prisma.user.findUnique({
            where: { email: body.username },
        });

        if (!user) {
            return reply.code(401).send({ error: "Invalid credentials" });
        }

        const isValidPassword = await bcrypt.compare(body.password, user.password);
        if (!isValidPassword) {
            return reply.code(401).send({ error: "Invalid credentials" });
        }

        const adminContext = await loadTenantAdminContext(deps.prisma, tenant.id, user.id);
        if (!adminContext) {
            return reply.code(401).send({ error: "Invalid credentials" });
        }

        const payload: JWTPayload = {
            role: adminContext.role,
            username: user.email,
            userId: user.id,
            tenantId: tenant.id,
            activeTenantId: tenant.id,
            permissions: adminContext.permissions ?? undefined,
        };

        const token = await reply.jwtSign(payload, { expiresIn: ADMIN_JWT_EXPIRES_IN });

        reply
            .setCookie("auth_token", token, {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: ADMIN_JWT_COOKIE_MAX_AGE_SEC,
            })
            .code(200)
            .send({ success: true });
    });

    // POST /auth/super-login - Super Admin Login (no tenant required)
    // SECURITY: Same rate limiting as regular login
    app.post<{ Body: z.infer<typeof zLoginRequest> }>("/auth/super-login", {
        schema: {
            body: zLoginRequest
        },
        config: {
            rateLimit: {
                max: 5,
                timeWindow: '15 minutes',
                keyGenerator: (req) => {
                    return `super-login:${req.ip}`;
                }
            }
        }
    }, async (req, reply) => {
        const body = req.body;

        // Fetch User from DB
        const user = await deps.prisma.user.findUnique({
            where: { email: body.username }
        });

        if (!user) {
            return reply.code(401).send({ error: "Invalid credentials" });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(body.password, user.password);
        if (!isValidPassword) {
            return reply.code(401).send({ error: "Invalid credentials" });
        }

        // Check if user has SUPER_ADMIN role
        if (user.role !== 'SUPER_ADMIN') {
            return reply.code(403).send({ error: "Access denied: Super admin privileges required" });
        }

        // Sign JWT WITHOUT tenantId (super admins work across all tenants)
        const payload: JWTPayload = {
            role: user.role,
            username: user.email,
            userId: user.id,
            // NO tenantId for super admins
        };

        const token = await reply.jwtSign(payload);

        reply
            .setCookie("auth_token", token, {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 7 * 24 * 3600,
            })
            .code(200)
            .send({ success: true });
    });

    const zSwitchTenantBody = z.object({ tenantId: z.string().uuid() });

    // POST /auth/switch-tenant - ACCESS_LEVELS Phase 2: set activeTenantId in JWT (requires existing JWT)
    app.post<{ Body: z.infer<typeof zSwitchTenantBody> }>("/auth/switch-tenant", {
        schema: { body: zSwitchTenantBody },
        preHandler: [async (req) => { await req.jwtVerify(); }],
    }, async (req, reply) => {
        const userId = (req.user as { userId?: string }).userId;
        if (!userId) {
            return reply.code(401).send({ error: "Invalid token" });
        }
        const { tenantId } = req.body;
        const adminContext = await loadTenantAdminContext(deps.prisma, tenantId, userId);
        if (!adminContext) {
            return reply.code(403).send({ error: "Not a member of this tenant", code: "FORBIDDEN" });
        }
        const payload: JWTPayload = {
            role: adminContext.role,
            username: (req.user as { username?: string }).username ?? "",
            userId,
            tenantId,
            activeTenantId: tenantId,
            permissions: adminContext.permissions ?? undefined,
        };
        const token = await reply.jwtSign(payload, { expiresIn: ADMIN_JWT_EXPIRES_IN });
        reply
            .setCookie("auth_token", token, {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: ADMIN_JWT_COOKIE_MAX_AGE_SEC,
            })
            .code(200)
            .send({ success: true });
    });

    // POST /auth/logout - Clear cookie
    app.post("/auth/logout", {
        schema: {
            // No body validation needed
        }
    }, async (req, reply) => {
        reply
            .clearCookie("auth_token", { path: "/" })
            .send({ success: true });
    });
}
