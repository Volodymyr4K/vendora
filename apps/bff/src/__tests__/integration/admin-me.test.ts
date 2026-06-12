/**
 * ACCESS_LEVELS Phase 6.3: GET /admin/me — isSuperAdmin from User.role.
 * Integration test: SUPER_ADMIN user → isSuperAdmin: true; normal user → field absent.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { authPlugin } from "../../plugins/auth.js";
import { tenantGuardPlugin } from "../../plugins/tenant-guard.js";
import { dashboardRoutes } from "../../domains/admin/dashboard/dashboard.routes.js";
import type { AdminDeps } from "../../domains/admin/types.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_SLUG = "test-tenant";
const USER_ID_NORMAL = "user-owner-001";
const USER_ID_SUPER = "user-super-001";

const tenant = {
    id: TENANT_ID,
    name: "Test Tenant",
    slug: TENANT_SLUG,
    isActive: true,
    customDomainsEnabled: false,
    features: {
        adminModules: { admin_dashboard: true },
    },
};

const mockPrisma = {
    user: {
        findUnique: async (args: { where: { id: string }; select: { role: true } }) => {
            return args.where.id === USER_ID_SUPER ? { role: "SUPER_ADMIN" } : { role: "TENANT_OWNER" };
        },
    },
};

const deps: AdminDeps = {
    prisma: mockPrisma as never,
    cache: {} as never,
};

describe("GET /admin/me isSuperAdmin", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        await app.register(fjwt, { secret: "test-secret-admin-me" });
        app.addHook("onRequest", async (req) => {
            const slug = req.headers["x-tenant-slug"] as string | undefined;
            if (slug === TENANT_SLUG) {
                (req as { tenant?: typeof tenant }).tenant = tenant;
            }
        });
        await app.register(
            async (adminScope) => {
                adminScope.addHook("onRequest", async (req) => {
                    const slug = req.headers["x-tenant-slug"] as string | undefined;
                    if (slug === TENANT_SLUG) {
                        (req as { tenant?: typeof tenant }).tenant = tenant;
                    }
                });
                await adminScope.register(authPlugin, { requireTenant: true });
                await adminScope.register(fp(tenantGuardPlugin), { prisma: mockPrisma as never });
                await adminScope.register(dashboardRoutes, deps);
            },
            { prefix: "/admin" }
        );
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("user.role = SUPER_ADMIN → /admin/me contains isSuperAdmin: true", async () => {
        const token = await app.jwt.sign({
            userId: USER_ID_SUPER,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/me",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json() as { role: string; isSuperAdmin?: boolean };
        expect(body.role).toBe("TENANT_OWNER");
        expect(body.isSuperAdmin).toBe(true);
    });

    it("normal user → /admin/me does not include isSuperAdmin (optional, backward compat)", async () => {
        const token = await app.jwt.sign({
            userId: USER_ID_NORMAL,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/me",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json() as { role: string; isSuperAdmin?: boolean };
        expect(body.role).toBe("TENANT_OWNER");
        expect(body.isSuperAdmin).toBeUndefined();
    });
});
