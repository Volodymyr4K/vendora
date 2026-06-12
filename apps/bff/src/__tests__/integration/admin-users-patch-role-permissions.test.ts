/**
 * AUDIT 7: Integration test for PATCH /admin/users with role + permissions in one request.
 * Regression: demoting TENANT_OWNER → TENANT_ADMIN and sending permissions in one body
 * must apply both (targetRole = body.role ?? membership.role). Unit test: users.patch-logic.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { authPlugin } from "../../plugins/auth.js";
import { tenantGuardPlugin } from "../../plugins/tenant-guard.js";
import { adminWriteContextPlugin } from "../../plugins/admin-write-context.js";
import { adminPermissionGuardPlugin } from "../../plugins/admin-permission-guard.js";
import { usersRoutes } from "../../domains/admin/users/users.routes.js";
import type { AdminDeps } from "../../domains/admin/types.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_SLUG = "tenant-patch-role-perms";
const CALLER_USER_ID = "11111111-1111-1111-1111-111111111111";
const TARGET_USER_ID = "22222222-2222-4222-a222-222222222222";

const tenantWithAdminModules = {
    id: TENANT_ID,
    name: "Tenant",
    slug: TENANT_SLUG,
    isActive: true,
    customDomainsEnabled: false,
    features: {
        adminModules: { admin_users: true, admin_dashboard: true, admin_orders: true },
    },
};

type PermRow = {
    moduleId: string;
    canView: boolean;
    canEdit: boolean;
    scopeType: string;
    branchId: string | null;
};

const state = {
    targetRole: "TENANT_OWNER" as "TENANT_OWNER" | "TENANT_ADMIN",
    targetPermissions: [] as PermRow[],
};

function buildMockPrisma() {
    return {
        tenantUser: {
            findUnique: async (args: {
                where: { tenantId_userId: { tenantId: string; userId: string } };
                include?: { tenantUserModulePermissions: { select: Record<string, boolean> } };
            }) => {
                const { tenantId, userId } = args.where.tenantId_userId;
                if (tenantId !== TENANT_ID) return null;
                if (userId === CALLER_USER_ID) {
                    return { role: "TENANT_OWNER", tenantUserModulePermissions: [] };
                }
                if (userId === TARGET_USER_ID) {
                    const perms = state.targetPermissions.map((p) => ({
                        id: "perm-1",
                        moduleId: p.moduleId,
                        canView: p.canView,
                        canEdit: p.canEdit,
                        scopeType: p.scopeType,
                        branchId: p.branchId,
                    }));
                    return {
                        role: state.targetRole,
                        tenantUserModulePermissions: perms,
                    };
                }
                return null;
            },
            findMany: async (args: { where: { tenantId: string }; include: unknown }) => {
                if (args.where.tenantId !== TENANT_ID) return [];
                const targetPerms = state.targetPermissions.map((p) => ({
                    moduleId: p.moduleId,
                    canView: p.canView,
                    canEdit: p.canEdit,
                    scopeType: p.scopeType,
                    branchId: p.branchId,
                }));
                return [
                    {
                        userId: CALLER_USER_ID,
                        role: "TENANT_OWNER",
                        user: { id: CALLER_USER_ID, email: "owner@test" },
                        tenantUserModulePermissions: [],
                    },
                    {
                        userId: TARGET_USER_ID,
                        role: state.targetRole,
                        user: { id: TARGET_USER_ID, email: "target@test" },
                        tenantUserModulePermissions: targetPerms,
                    },
                ];
            },
            count: async (args: { where: { tenantId: string; role: string; userId?: { not: string } } }) => {
                if (args.where.tenantId !== TENANT_ID) return 0;
                if (args.where.role === "TENANT_OWNER" && args.where.userId?.not === TARGET_USER_ID) {
                    return 1;
                }
                return 2;
            },
            update: async () => ({}),
            create: async () => ({}),
            delete: async () => ({}),
        },
        tenantUserModulePermission: {
            findMany: async () => [],
            deleteMany: async () => ({}),
            create: async () => ({}),
        },
        branch: { findMany: async () => [] },
        userCapability: { findFirst: async () => null },
        user: { findUnique: async () => null, findMany: async () => [] },
        $transaction: async (
            fn: (tx: {
                tenantUser: {
                    update: (args: { where: unknown; data: { role: string } }) => Promise<unknown>;
                    count: (args: unknown) => Promise<number>;
                };
                tenantUserModulePermission: {
                    deleteMany: (args: { where: { tenantId: string; userId: string; moduleId: string } }) => Promise<unknown>;
                    create: (args: { data: { tenantId: string; userId: string; moduleId: string; canView: boolean; canEdit: boolean; scopeType: string; branchId: string | null } }) => Promise<unknown>;
                };
            }) => Promise<unknown>
        ) => {
            const tx = {
                tenantUser: {
                    count: async (args: { where: { userId?: { not: string } } }) => {
                        if (args.where.userId?.not === TARGET_USER_ID) return 1;
                        return 2;
                    },
                    update: async (args: { where: unknown; data: { role: string } }) => {
                        state.targetRole = args.data.role as "TENANT_OWNER" | "TENANT_ADMIN";
                        return {};
                    },
                },
                tenantUserModulePermission: {
                    deleteMany: async (args: { where: { tenantId: string; userId: string; moduleId: string } }) => {
                        if (args.where.userId === TARGET_USER_ID) {
                            state.targetPermissions = state.targetPermissions.filter((p) => p.moduleId !== args.where.moduleId);
                        }
                        return {};
                    },
                    create: async (args: {
                        data: { tenantId: string; userId: string; moduleId: string; canView: boolean; canEdit: boolean; scopeType: string; branchId: string | null };
                    }) => {
                        if (args.data.userId === TARGET_USER_ID) {
                            state.targetPermissions.push({
                                moduleId: args.data.moduleId,
                                canView: args.data.canView,
                                canEdit: args.data.canEdit,
                                scopeType: args.data.scopeType,
                                branchId: args.data.branchId,
                            });
                        }
                        return {};
                    },
                },
            };
            return fn(tx);
        },
    };
}

describe("Admin users routes (GET + PATCH integration)", () => {
    let app: FastifyInstance;
    let mockPrisma: ReturnType<typeof buildMockPrisma>;

    beforeAll(async () => {
        state.targetRole = "TENANT_OWNER";
        state.targetPermissions = [];
        mockPrisma = buildMockPrisma();

        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        await app.register(fjwt, { secret: "test-secret-patch-role-perms" });

        app.addHook("onRequest", async (req) => {
            const slug = req.headers["x-tenant-slug"] as string | undefined;
            if (slug === TENANT_SLUG) {
                (req as { tenant?: typeof tenantWithAdminModules }).tenant = tenantWithAdminModules;
            }
        });

        await app.register(
            async (adminScope) => {
                adminScope.setValidatorCompiler(validatorCompiler);
                adminScope.setSerializerCompiler(serializerCompiler);
                adminScope.addHook("onRequest", async (req) => {
                    const slug = req.headers["x-tenant-slug"] as string | undefined;
                    if (slug === TENANT_SLUG) {
                        (req as { tenant?: typeof tenantWithAdminModules }).tenant = tenantWithAdminModules;
                    }
                });
                await adminScope.register(authPlugin, { requireTenant: true });
                await adminScope.register(fp(tenantGuardPlugin), { prisma: mockPrisma as never });
                await adminScope.register(fp(adminWriteContextPlugin), { prisma: mockPrisma as never });
                await adminScope.register(fp(adminPermissionGuardPlugin), { prisma: mockPrisma as never });
                const deps: AdminDeps = { prisma: mockPrisma as never, cache: {} as never };
                await adminScope.register(usersRoutes, deps);
            },
            { prefix: "/admin" }
        );

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("GET /admin/users returns 200 (route and auth work)", async () => {
        const token = await app.jwt.sign({
            userId: CALLER_USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        if (response.statusCode !== 200) {
            throw new Error(`GET /admin/users: expected 200, got ${response.statusCode}: ${response.payload}`);
        }
        const body = response.json() as { members: unknown[] };
        expect(Array.isArray(body.members)).toBe(true);
    });

    it("PATCH owner→admin with role+permissions in one request → 200; GET confirms permissions applied", async () => {
        const token = await app.jwt.sign({
            userId: CALLER_USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });

        const patchBody = {
            role: "TENANT_ADMIN" as const,
            permissions: {
                admin_orders: {
                    canView: true,
                    canEdit: false,
                    scopeType: "ALL" as const,
                    branchIds: [] as string[],
                },
            },
        };

        const patchRes = await app.inject({
            method: "PATCH",
            url: `/admin/users/${TARGET_USER_ID}`,
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
                "content-type": "application/json",
            },
            payload: JSON.stringify(patchBody),
        });

        if (patchRes.statusCode !== 200) {
            const err = patchRes.json() as { code?: string; error?: string; validation?: unknown };
            throw new Error(
                `PATCH expected 200, got ${patchRes.statusCode}: ${JSON.stringify({ code: err.code, error: err.error, validation: err.validation })}`
            );
        }

        const patchData = patchRes.json() as { userId: string; role?: string; permissions?: Record<string, { canView: boolean; canEdit: boolean; scopeType: string; branchIds: string[] }> };
        expect(patchData.userId).toBe(TARGET_USER_ID);
        expect(patchData.role).toBe("TENANT_ADMIN");
        expect(patchData.permissions?.admin_orders).toEqual({
            canView: true,
            canEdit: false,
            scopeType: "ALL",
            branchIds: [],
        });

        const getRes = await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(getRes.statusCode).toBe(200);
        const getData = getRes.json() as { members: Array<{ userId: string; role: string; permissions: Record<string, { canView: boolean; canEdit: boolean }> | null }> };
        const targetMember = getData.members.find((m) => m.userId === TARGET_USER_ID);
        expect(targetMember).toBeDefined();
        expect(targetMember!.role).toBe("TENANT_ADMIN");
        expect(targetMember!.permissions).not.toBeNull();
        expect(targetMember!.permissions!.admin_orders.canView).toBe(true);
        expect(targetMember!.permissions!.admin_orders.canEdit).toBe(false);
    });
});
