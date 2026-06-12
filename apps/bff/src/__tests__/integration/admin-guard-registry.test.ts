/**
 * ACCESS_LEVELS Phase 3: Integration test — guard runs under /admin like prod.
 * Same plugin order as prod: auth → tenantGuard → adminWriteContext → adminPermissionGuard → routes.
 * Proves: 200 when module enabled; 403 MODULE_DISABLED when admin_dashboard=false; 403 NO_REGISTRY_ENTRY when route not in registry;
 * 403 PERMISSION_DENIED when TENANT_ADMIN without canView on module; 403 when JWT tenantId vs x-tenant-slug mismatch (auth/tenantGuard).
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import fp from "fastify-plugin";
import fjwt from "@fastify/jwt";
import { authPlugin } from "../../plugins/auth.js";
import { tenantGuardPlugin } from "../../plugins/tenant-guard.js";
import { adminWriteContextPlugin } from "../../plugins/admin-write-context.js";
import { adminPermissionGuardPlugin } from "../../plugins/admin-permission-guard.js";
import { getRouteId } from "../../lib/get-route-id.js";
import { getAdminRouteEntry } from "../../lib/admin-route-registry.js";
import { AdminGuardDenialReason } from "../../lib/admin-guard-denial-reasons.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_SLUG = "test-tenant";
const TENANT_SLUG_DISABLED = "test-tenant-disabled";
const TENANT_ID_DISABLED = "22222222-2222-2222-2222-222222222222";
const USER_ID = "user-owner-001";
const USER_ID_BRANCH_SCOPED = "user-admin-branch-scoped";
const USER_ID_READ_ONLY = "user-admin-read-only";
const USER_ID_NORMALIZED = "user-normalized-001";
const USER_ID_STALE_JWT = "user-stale-jwt-001"; // write-refresh test: JWT has canEdit, DB has canEdit false
const BRANCH_ALLOWED_ID = "branch-allowed-id"; // only this branch allowed for USER_ID_BRANCH_SCOPED

// ACCESS_LEVELS must-have tests: admin_orders for read-only + branch write; admin_users for owner-only.
const tenantWithAdminDashboard = {
    id: TENANT_ID,
    name: "Test Tenant",
    slug: TENANT_SLUG,
    isActive: true,
    customDomainsEnabled: false,
    features: {
        adminModules: { admin_dashboard: true, admin_orders: true, admin_users: true },
    },
};

const tenantWithModuleDisabled = {
    id: TENANT_ID_DISABLED,
    name: "Tenant Disabled",
    slug: TENANT_SLUG_DISABLED,
    isActive: true,
    customDomainsEnabled: false,
    features: {
        adminModules: { admin_dashboard: false },
    },
};

// ACCESS_LEVELS Phase 5: tenant with admin_users disabled (Gate №1 for /users)
const TENANT_SLUG_USERS_DISABLED = "tenant-users-disabled";
const TENANT_ID_USERS_DISABLED = "33333333-3333-3333-3333-333333333333";
const tenantWithAdminUsersDisabled = {
    id: TENANT_ID_USERS_DISABLED,
    name: "Tenant Users Disabled",
    slug: TENANT_SLUG_USERS_DISABLED,
    isActive: true,
    customDomainsEnabled: false,
    features: {
        adminModules: { admin_users: false },
    },
};

const BRANCH_ID_1 = "branch-id-1";
const mockPrisma = {
    tenantUser: {
        findUnique: async (args: { where: { tenantId_userId: { tenantId: string; userId: string } } }) => {
            const { tenantId, userId } = args.where.tenantId_userId;
            if (tenantId === TENANT_ID && userId === USER_ID) return { role: "TENANT_OWNER" };
            if (tenantId === TENANT_ID && userId === USER_ID_BRANCH_SCOPED) return { role: "TENANT_ADMIN" };
            if (tenantId === TENANT_ID && userId === USER_ID_READ_ONLY) return { role: "TENANT_ADMIN" };
            if (tenantId === TENANT_ID && userId === USER_ID_NORMALIZED) return { role: "TENANT_ADMIN" };
            if (tenantId === TENANT_ID && userId === USER_ID_STALE_JWT) return { role: "TENANT_ADMIN" };
            if (tenantId === TENANT_ID_DISABLED && userId === USER_ID) return { role: "TENANT_OWNER" };
            if (tenantId === TENANT_ID_USERS_DISABLED && userId === USER_ID) return { role: "TENANT_OWNER" };
            return null;
        },
    },
    tenantUserModulePermission: {
        findMany: async (args: { where: { tenantId: string; userId: string } }) => {
            if (args.where.tenantId === TENANT_ID && args.where.userId === USER_ID_BRANCH_SCOPED) {
                return [
                    {
                        moduleId: "admin_dashboard",
                        canView: true,
                        canEdit: false,
                        scopeType: "BRANCH",
                        branchId: BRANCH_ALLOWED_ID,
                    },
                    {
                        moduleId: "admin_orders",
                        canView: true,
                        canEdit: true,
                        scopeType: "BRANCH",
                        branchId: BRANCH_ALLOWED_ID,
                    },
                ];
            }
            if (args.where.tenantId === TENANT_ID && args.where.userId === USER_ID_READ_ONLY) {
                return [
                    {
                        moduleId: "admin_orders",
                        canView: true,
                        canEdit: false,
                        scopeType: "ALL",
                        branchId: null,
                    },
                ];
            }
            // Normalization test: DB has canView false, canEdit true → loadTenantAdminContext normalizes to canView true
            if (args.where.tenantId === TENANT_ID && args.where.userId === USER_ID_NORMALIZED) {
                return [
                    {
                        moduleId: "admin_dashboard",
                        canView: false,
                        canEdit: true,
                        scopeType: "ALL",
                        branchId: null,
                    },
                ];
            }
            // Write-refresh test: DB has canEdit false (rights revoked after login); write uses fresh context → 403
            if (args.where.tenantId === TENANT_ID && args.where.userId === USER_ID_STALE_JWT) {
                return [
                    {
                        moduleId: "admin_orders",
                        canView: true,
                        canEdit: false,
                        scopeType: "ALL",
                        branchId: null,
                    },
                ];
            }
            return [];
        },
    },
    userCapability: { findFirst: async () => null },
    // Phase 3.5: branchScoped guard resolves branch from params; return branch for tenant so 200 test passes.
    branch: {
        findFirst: async (args: { where: { tenantId: string; slug: string } }) => {
            if (args.where.tenantId === TENANT_ID && args.where.slug === "branch-1") {
                return { id: BRANCH_ID_1, tenantId: TENANT_ID };
            }
            if (args.where.tenantId === TENANT_ID && args.where.slug === "branch-allowed") {
                return { id: BRANCH_ALLOWED_ID, tenantId: TENANT_ID };
            }
            if (args.where.tenantId === TENANT_ID_DISABLED && args.where.slug === "branch-1") {
                return { id: "branch-id-disabled", tenantId: TENANT_ID_DISABLED };
            }
            return null;
        },
    },
};

function getTenantBySlug(slug: string) {
    if (slug === TENANT_SLUG) return tenantWithAdminDashboard;
    if (slug === TENANT_SLUG_DISABLED) return tenantWithModuleDisabled;
    if (slug === TENANT_SLUG_USERS_DISABLED) return tenantWithAdminUsersDisabled;
    return null;
}

describe("Admin guard: registry entry on real request under /admin", () => {
    let app: FastifyInstance;
    let lastDenialReason: string | undefined;

    beforeAll(async () => {
        app = Fastify({ logger: false });

        const origDebug = app.log.debug.bind(app.log);
        app.log.debug = (obj: unknown, msg?: string) => {
            if (typeof obj === "object" && obj !== null && "reason" in obj) {
                lastDenialReason = (obj as { reason: string }).reason;
            }
            return origDebug(obj, msg);
        };

        await app.register(fjwt, { secret: "test-secret-admin-guard" });

        app.addHook("onRequest", async (req) => {
            const slug = req.headers["x-tenant-slug"] as string | undefined;
            const tenant = slug ? getTenantBySlug(slug) : null;
            if (tenant) {
                (req as { tenant?: typeof tenantWithAdminDashboard }).tenant = tenant;
            }
        });

        await app.register(
            async (adminScope) => {
                adminScope.addHook("onRequest", async (req) => {
                    const slug = req.headers["x-tenant-slug"] as string | undefined;
                    const tenant = slug ? getTenantBySlug(slug) : null;
                    if (tenant) {
                        (req as { tenant?: typeof tenantWithAdminDashboard }).tenant = tenant;
                    }
                });
                await adminScope.register(authPlugin, { requireTenant: true });
                // Use fp so hooks run on adminScope for requests to routes registered on adminScope (Fastify encapsulation).
                await adminScope.register(fp(tenantGuardPlugin), {
                    prisma: mockPrisma as never,
                });
                await adminScope.register(fp(adminWriteContextPlugin), {
                    prisma: mockPrisma as never,
                });
                await adminScope.register(fp(adminPermissionGuardPlugin), {
                    prisma: mockPrisma as never,
                });

                adminScope.get<{ Params: { branchSlug: string } }>(
                    "/:branchSlug/stats",
                    async (_req, reply) => {
                        return reply.send({
                            meta: { isDegraded: false, skippedOrders: 0 },
                            revenue: 0,
                            deliveryRevenue: 0,
                            avgCheck: 0,
                            orders: { done: 0, cancelled: 0, inProgress: 0 },
                            topProducts: [],
                        });
                    }
                );
                adminScope.get<{ Params: { branchSlug: string } }>(
                    "/:branchSlug/orders",
                    async (_req, reply) => reply.send({ orders: [] })
                );
                adminScope.patch<{ Params: { branchSlug: string; id: string }; Body: { status?: string } }>(
                    "/:branchSlug/orders/:id/status",
                    async (_req, reply) => reply.send({ ok: true })
                );
                adminScope.get<{ Params: { branchSlug: string } }>(
                    "/:branchSlug/unknown-registry-path",
                    async (_req, reply) => reply.send({ ok: true })
                );
                // Route only in test harness (not in ADMIN_ROUTE_REGISTRY) → guard returns NO_REGISTRY_ENTRY.
                adminScope.get<{ Params: { branchId: string } }>(
                    "/:branchId/stats-alt",
                    async (_req, reply) => reply.send({ meta: {}, revenue: 0, orders: {}, topProducts: [] })
                );
                // ACCESS_LEVELS Phase 5: minimal GET /users so guard runs (Gate №1 test)
                adminScope.get("/users", async (_req, reply) =>
                    reply.send({ members: [], enabledAdminModuleIds: [] })
                );
                // ACCESS_LEVELS Phase 6.1: GET /me is whitelisted — minimal handler for whitelist tests
                adminScope.get("/me", async (req, reply) => {
                    const ctx = (req as { adminContext?: { role: string; permissions: unknown } }).adminContext;
                    return reply.send({
                        role: ctx?.role ?? "TENANT_OWNER",
                        permissions: ctx?.permissions ?? null,
                        enabledAdminModuleIds: [],
                    });
                });
            },
            { prefix: "/admin" }
        );

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("GET /admin/branch-1/stats with enabled module → 200", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(200);
        const routeId = "GET /:branch/stats";
        const entry = getAdminRouteEntry(routeId);
        expect(entry).toBeDefined();
        expect(entry?.moduleId).toBe("admin_dashboard");
    });

    it("GET /admin/branch-1/stats with admin_dashboard=false → 403, reason MODULE_DISABLED", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID_DISABLED,
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats",
            headers: {
                "x-tenant-slug": TENANT_SLUG_DISABLED,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.MODULE_DISABLED);
    });

    it("GET /admin/branch-1/stats as TENANT_ADMIN without canView on admin_dashboard → 403, reason PERMISSION_DENIED", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: "user-admin-001",
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_dashboard: { canView: false, canEdit: false, allowedBranchIds: null } },
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.PERMISSION_DENIED);
    });

    it("TENANT_ADMIN + branch not in allowedBranchIds → 403, reason BRANCH_DENIED", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_BRANCH_SCOPED,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_dashboard: { canView: true, canEdit: false, allowedBranchIds: [BRANCH_ALLOWED_ID] } },
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.BRANCH_DENIED);
    });

    it("route in test harness but not in ADMIN_ROUTE_REGISTRY → 403 NO_REGISTRY_ENTRY", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats-alt",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.NO_REGISTRY_ENTRY);
    });

    it("TENANT_ADMIN with allowedBranchIds including branch → GET /admin/branch-allowed/stats 200", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_BRANCH_SCOPED,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_dashboard: { canView: true, canEdit: false, allowedBranchIds: [BRANCH_ALLOWED_ID] } },
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-allowed/stats",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(200);
        expect(lastDenialReason).toBeUndefined();
    });

    it("JWT tenantId vs x-tenant-slug mismatch → 403 (auth/tenantGuard rejects)", async () => {
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats",
            headers: {
                "x-tenant-slug": TENANT_SLUG_DISABLED,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
    });

    it("GET /admin/branch-1/unknown-registry-path → 403, reason NO_REGISTRY_ENTRY", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/unknown-registry-path",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.NO_REGISTRY_ENTRY);
    });

    it("getRouteId(routerPath) matches registry", () => {
        const req = { method: "GET", routerPath: "/:branchSlug/stats" };
        const routeId = getRouteId(req);
        expect(routeId).toBe("GET /:branch/stats");
        expect(getAdminRouteEntry(routeId)).toBeDefined();
    });

    it("GET /admin/users with admin_users disabled → 403, reason MODULE_DISABLED (even for owner)", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID_USERS_DISABLED,
        });

        const response = await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: {
                "x-tenant-slug": TENANT_SLUG_USERS_DISABLED,
                authorization: `Bearer ${token}`,
            },
        });

        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.MODULE_DISABLED);
    });

    // ACCESS_LEVELS Phase 6.1: whitelist — GET /me is allowed without registry/module check, but auth + mismatch + adminContext still required
    it("GET /admin/me without JWT → 401 or 403", async () => {
        const response = await app.inject({
            method: "GET",
            url: "/admin/me",
            headers: { "x-tenant-slug": TENANT_SLUG },
        });
        expect([401, 403]).toContain(response.statusCode);
    });

    it("GET /admin/me with JWT but tenant mismatch → 403", async () => {
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID,
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/me",
            headers: {
                "x-tenant-slug": TENANT_SLUG_DISABLED,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
    });

    it("GET /admin/me with JWT role not tenant (no adminContext) → 403", async () => {
        const token = await app.jwt.sign({
            userId: "customer-001",
            role: "customer",
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
        expect(response.statusCode).toBe(403);
    });

    it("GET /admin/me with valid owner token and tenant (whitelist) → 200 even when no module enabled", async () => {
        const token = await app.jwt.sign({
            userId: USER_ID,
            role: "TENANT_OWNER",
            tenantId: TENANT_ID_USERS_DISABLED,
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/me",
            headers: {
                "x-tenant-slug": TENANT_SLUG_USERS_DISABLED,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(200);
        const body = response.json() as { role?: string; enabledAdminModuleIds?: unknown };
        expect(body.role).toBe("TENANT_OWNER");
        expect(Array.isArray(body.enabledAdminModuleIds)).toBe(true);
    });

    // ACCESS_LEVELS must-have: Owner-only — TENANT_ADMIN (any rights) → GET /admin/users 403
    it("GET /admin/users as TENANT_ADMIN (owner-only) → 403, reason OWNER_ONLY_DENIED", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_READ_ONLY,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_users: { canView: true, canEdit: true, allowedBranchIds: null } },
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/users",
            headers: {
                "x-tenant-slug": TENANT_SLUG,
                authorization: `Bearer ${token}`,
            },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.OWNER_ONLY_DENIED);
    });

    // ACCESS_LEVELS must-have: Admin read-only — canView only → GET 200, PATCH 403
    it("TENANT_ADMIN with admin_orders canView only (no canEdit) → GET /orders 200, PATCH /orders/:id/status 403", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_READ_ONLY,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_orders: { canView: true, canEdit: false, allowedBranchIds: null } },
        });
        const getRes = await app.inject({
            method: "GET",
            url: "/admin/branch-1/orders",
            headers: { "x-tenant-slug": TENANT_SLUG, authorization: `Bearer ${token}` },
        });
        expect(getRes.statusCode).toBe(200);
        lastDenialReason = undefined;
        const patchRes = await app.inject({
            method: "PATCH",
            url: "/admin/branch-1/orders/ord-1/status",
            headers: { "x-tenant-slug": TENANT_SLUG, authorization: `Bearer ${token}` },
            payload: { status: "done" },
        });
        expect(patchRes.statusCode).toBe(403);
        expect(patchRes.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.PERMISSION_DENIED);
    });

    // ACCESS_LEVELS must-have: Permission normalization — DB canView false, canEdit true → loadTenantAdminContext normalizes → read 200
    it("TENANT_ADMIN with admin_dashboard canView: false, canEdit: true in DB (normalized to canView) → GET /stats 200", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_NORMALIZED,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_dashboard: { canView: false, canEdit: true, allowedBranchIds: null } },
        });
        const response = await app.inject({
            method: "GET",
            url: "/admin/branch-1/stats",
            headers: { "x-tenant-slug": TENANT_SLUG, authorization: `Bearer ${token}` },
        });
        expect(response.statusCode).toBe(200);
        expect(lastDenialReason).toBeUndefined();
    });

    // ACCESS_LEVELS plan 3.4: Write refresh — JWT has canEdit, DB has canEdit false → PATCH 403 PERMISSION_DENIED
    it("PATCH with stale JWT (canEdit in token) but DB has canEdit false → 403 PERMISSION_DENIED (write refresh)", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_STALE_JWT,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: { admin_orders: { canView: true, canEdit: true, allowedBranchIds: null } },
        });
        const response = await app.inject({
            method: "PATCH",
            url: "/admin/branch-1/orders/ord-1/status",
            headers: { "x-tenant-slug": TENANT_SLUG, authorization: `Bearer ${token}` },
            payload: { status: "done" },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.PERMISSION_DENIED);
    });

    // ACCESS_LEVELS must-have: Branch leakage — PATCH to branch not in allowedBranchIds → 403
    it("TENANT_ADMIN with admin_orders only for branch-allowed → PATCH /branch-1/orders/:id/status 403 BRANCH_DENIED", async () => {
        lastDenialReason = undefined;
        const token = await app.jwt.sign({
            userId: USER_ID_BRANCH_SCOPED,
            role: "TENANT_ADMIN",
            tenantId: TENANT_ID,
            permissions: {
                admin_orders: { canView: true, canEdit: true, allowedBranchIds: [BRANCH_ALLOWED_ID] },
            },
        });
        const response = await app.inject({
            method: "PATCH",
            url: "/admin/branch-1/orders/ord-1/status",
            headers: { "x-tenant-slug": TENANT_SLUG, authorization: `Bearer ${token}` },
            payload: { status: "done" },
        });
        expect(response.statusCode).toBe(403);
        expect(response.json().code).toBe("FORBIDDEN");
        expect(lastDenialReason).toBe(AdminGuardDenialReason.BRANCH_DENIED);
    });
});
