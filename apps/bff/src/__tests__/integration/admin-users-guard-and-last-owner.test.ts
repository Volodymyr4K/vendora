/**
 * ACCESS_LEVELS Phase 5: Integration test for LAST_OWNER on real route.
 * DELETE /users/:userId when last owner → 400 LAST_OWNER (transaction + error code).
 * Gate №1 test for /users is in admin-guard-registry.test.ts.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { authPlugin } from "../../plugins/auth.js";
import { tenantGuardPlugin } from "../../plugins/tenant-guard.js";
import { adminWriteContextPlugin } from "../../plugins/admin-write-context.js";
import { adminPermissionGuardPlugin } from "../../plugins/admin-permission-guard.js";
import { ensureAtLeastOneOwner, LAST_OWNER_CODE } from "../../lib/last-owner-guard.js";

const TENANT_ID = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const TENANT_SLUG = "tenant-last-owner";
const OWNER_USER_ID = "owner-001";
const TARGET_USER_ID = "user-to-delete-001";

const tenantWithAdminUsersEnabled = {
    id: TENANT_ID,
    name: "Tenant",
    slug: TENANT_SLUG,
    isActive: true,
    customDomainsEnabled: false,
    features: { adminModules: { admin_users: true } },
};

const mockPrismaGuard = {
    tenantUser: {
        findUnique: async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => {
            if (args.where.tenantId_userId.tenantId === TENANT_ID && args.where.tenantId_userId.userId === OWNER_USER_ID) {
                return { role: "TENANT_OWNER" };
            }
            return null;
        },
        findMany: async () => [],
        count: async () => 0,
        update: async () => ({}),
        create: async () => ({}),
        delete: async () => ({}),
    },
    tenantUserModulePermission: { findMany: async () => [] },
    userCapability: { findFirst: async () => null },
    user: { findUnique: async () => null },
    $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(mockPrismaGuard),
};

describe("Admin DELETE /users: LAST_OWNER integration", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify({ logger: false });
        await app.register(fjwt, { secret: "test-secret-last-owner" });

        await app.register(
            async (adminScope) => {
                adminScope.addHook("onRequest", async (req) => {
                    const slug = req.headers["x-tenant-slug"] as string | undefined;
                    if (slug === TENANT_SLUG) {
                        (req as { tenant?: typeof tenantWithAdminUsersEnabled }).tenant = tenantWithAdminUsersEnabled;
                    }
                });
                await adminScope.register(authPlugin, { requireTenant: true });
                await adminScope.register(fp(tenantGuardPlugin), { prisma: mockPrismaGuard as never });
                await adminScope.register(fp(adminWriteContextPlugin), { prisma: mockPrismaGuard as never });
                await adminScope.register(fp(adminPermissionGuardPlugin), { prisma: mockPrismaGuard as never });

                const mockPrismaLastOwner = {
                    tenantUser: {
                        findUnique: async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => {
                            if (args.where.tenantId_userId.tenantId === TENANT_ID && args.where.tenantId_userId.userId === TARGET_USER_ID) {
                                return { id: "m1", tenantId: TENANT_ID, userId: TARGET_USER_ID, role: "TENANT_OWNER" };
                            }
                            return null;
                        },
                        findMany: async () => [],
                        count: async () => 0,
                        update: async () => ({}),
                        create: async () => ({}),
                        delete: async () => ({}),
                    },
                    tenantUserModulePermission: { findMany: async () => [] },
                    userCapability: { findFirst: async () => null },
                    user: { findUnique: async () => null },
                    $transaction: async (
                        fn: (tx: { tenantUser: { count: () => Promise<number>; delete: () => Promise<unknown> } }) => Promise<unknown>
                    ) => {
                        const tx = {
                            tenantUser: {
                                count: async () => 0,
                                delete: async () => ({}),
                            },
                        };
                        return fn(tx);
                    },
                };

                adminScope.delete<{ Params: { userId: string } }>("/users/:userId", async (req, reply) => {
                    const tenantId = req.adminContext!.tenantId;
                    const targetUserId = req.params.userId;
                    const prisma = mockPrismaLastOwner as Parameters<typeof ensureAtLeastOneOwner>[0];

                    const membership = await prisma.tenantUser.findUnique({
                        where: { tenantId_userId: { tenantId, userId: targetUserId } },
                    } as never);
                    if (!membership) {
                        return reply.code(404).send({ error: "Member not found", code: "MEMBER_NOT_FOUND" });
                    }
                    if ((membership as { role: string }).role === "TENANT_OWNER") {
                        try {
                            await (prisma.$transaction as (fn: (tx: Parameters<typeof ensureAtLeastOneOwner>[0]) => Promise<void>) => Promise<unknown>)(
                                async (tx) => {
                                    await ensureAtLeastOneOwner(tx, tenantId, targetUserId);
                                    await (tx as { tenantUser: { delete: (args: unknown) => Promise<unknown> } }).tenantUser.delete({
                                        where: { tenantId_userId: { tenantId, userId: targetUserId } },
                                    });
                                }
                            );
                        } catch (err) {
                            const e = err as Error & { code?: string };
                            if (e.code === LAST_OWNER_CODE) {
                                return reply.code(400).send({ error: e.message, code: LAST_OWNER_CODE });
                            }
                            throw err;
                        }
                    } else {
                        await (prisma.tenantUser as { delete: (args: unknown) => Promise<unknown> }).delete({
                            where: { tenantId_userId: { tenantId, userId: targetUserId } },
                        } as never);
                    }
                    return reply.code(204).send();
                });
            },
            { prefix: "/admin" }
        );

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("DELETE /admin/users/:userId when last owner → 400 LAST_OWNER", async () => {
        const token = await app.jwt.sign({
            userId: OWNER_USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });

        const response = await app.inject({
            method: "DELETE",
            url: `/admin/users/${TARGET_USER_ID}`,
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(400);
        const body = response.json() as { code?: string; error?: string };
        expect(body.code).toBe(LAST_OWNER_CODE);
        expect(body.error).toContain("last owner");
    });
});
