/**
 * ACCESS_LEVELS Phase 3.5: Integration test — no read leakage between branches.
 * Two branches, different CategoryBranch: request to branch A must not return branch B's categories/items.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { menuRoutes } from "../../domains/admin/catalog/menu.routes.js";
import type { AdminDeps } from "../../domains/admin/types.js";

const TENANT_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const BRANCH_A_SLUG = "branch-a";
const BRANCH_B_SLUG = "branch-b";
const BRANCH_A_ID = "branch-a-id";
const BRANCH_B_ID = "branch-b-id";
const CAT_A_ID = "cat-a-id";
const CAT_B_ID = "cat-b-id";
const ITEM_A_ID = "item-a-id";
const ITEM_B_ID = "item-b-id";

const categoryA = {
    id: CAT_A_ID,
    slug: "cat-a",
    title: "Category A",
    sortOrder: 0,
    isAvailable: true,
    tenantId: TENANT_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const categoryB = {
    id: CAT_B_ID,
    slug: "cat-b",
    title: "Category B",
    sortOrder: 0,
    isAvailable: true,
    tenantId: TENANT_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
};

const itemA = {
    id: ITEM_A_ID,
    slug: "item-a",
    categoryId: CAT_A_ID,
    title: "Item A",
    desc: null,
    baseType: "GOOD",
    status: "ACTIVE",
    basePriceCents: 1000,
    imageUrl: null,
    weightG: null,
    tenantId: TENANT_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
};
const itemB = {
    id: ITEM_B_ID,
    slug: "item-b",
    categoryId: CAT_B_ID,
    title: "Item B",
    desc: null,
    baseType: "GOOD",
    status: "ACTIVE",
    basePriceCents: 2000,
    imageUrl: null,
    weightG: null,
    tenantId: TENANT_ID,
    createdAt: new Date(),
    updatedAt: new Date(),
};

function buildMockPrisma() {
    return {
        branch: {
            findFirst: async (args: { where: { tenantId: string; slug: string } }) => {
                if (args.where.tenantId !== TENANT_ID) return null;
                if (args.where.slug === BRANCH_A_SLUG) return { id: BRANCH_A_ID };
                if (args.where.slug === BRANCH_B_SLUG) return { id: BRANCH_B_ID };
                return null;
            },
        },
        category: {
            findMany: async (args: {
                where: {
                    tenantId: string;
                    categoryBranches?: { some: { branchId: string } };
                };
            }) => {
                if (args.where.tenantId !== TENANT_ID) return [];
                const branchId = args.where.categoryBranches?.some?.branchId;
                if (branchId === BRANCH_A_ID) return [categoryA];
                if (branchId === BRANCH_B_ID) return [categoryB];
                return [];
            },
        },
        catalogItem: {
            findMany: async (args: {
                where: { tenantId: string; categoryId?: { in: string[] } };
            }) => {
                if (args.where.tenantId !== TENANT_ID) return [];
                const ids = args.where.categoryId?.in ?? [];
                const out = [];
                if (ids.includes(CAT_A_ID)) out.push(itemA);
                if (ids.includes(CAT_B_ID)) out.push(itemB);
                return out;
            },
        },
    };
}

const tenant = {
    id: TENANT_ID,
    name: "Test",
    slug: "test-tenant",
    isActive: true,
    customDomainsEnabled: false,
};

describe("Admin menu: branch-scope read leakage", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify({ logger: false });
        const mockPrisma = buildMockPrisma();
        app.addHook("onRequest", async (req) => {
            const slug = (req.headers["x-tenant-slug"] as string) ?? "test-tenant";
            if (slug === "test-tenant") {
                (req as { tenant?: typeof tenant }).tenant = tenant;
            }
        });
        await app.register(menuRoutes, {
            prefix: "/admin",
            prisma: mockPrisma as AdminDeps["prisma"],
            cache: { get: async () => null, set: async () => {}, del: async () => {} },
        } as unknown as AdminDeps);
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("GET /admin/branch-a/categories returns only branch A categories, not branch B", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/admin/branch-a/categories",
            headers: { "x-tenant-slug": "test-tenant" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { id: string; slug: string; title: string }[];
        expect(Array.isArray(body)).toBe(true);
        expect(body.length).toBe(1);
        expect(body[0].id).toBe(CAT_A_ID);
        expect(body[0].slug).toBe("cat-a");
        expect(body.some((c) => c.id === CAT_B_ID)).toBe(false);
    });

    it("GET /admin/branch-b/categories returns only branch B categories, not branch A", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/admin/branch-b/categories",
            headers: { "x-tenant-slug": "test-tenant" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { id: string; slug: string }[];
        expect(body.length).toBe(1);
        expect(body[0].id).toBe(CAT_B_ID);
        expect(body.some((c) => c.id === CAT_A_ID)).toBe(false);
    });

    it("GET /admin/branch-a/menu returns only branch A categories and items, not branch B", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/admin/branch-a/menu",
            headers: { "x-tenant-slug": "test-tenant" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { categories: { id: string }[]; items: { id: string }[] };
        expect(body.categories.length).toBe(1);
        expect(body.categories[0].id).toBe(CAT_A_ID);
        expect(body.items.length).toBe(1);
        expect(body.items[0].id).toBe(ITEM_A_ID);
        expect(body.items.some((i) => i.id === ITEM_B_ID)).toBe(false);
    });

    it("GET /admin/branch-b/menu returns only branch B categories and items, not branch A", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/admin/branch-b/menu",
            headers: { "x-tenant-slug": "test-tenant" },
        });
        expect(res.statusCode).toBe(200);
        const body = res.json() as { categories: { id: string }[]; items: { id: string }[] };
        expect(body.categories.length).toBe(1);
        expect(body.categories[0].id).toBe(CAT_B_ID);
        expect(body.items.length).toBe(1);
        expect(body.items[0].id).toBe(ITEM_B_ID);
        expect(body.items.some((i) => i.id === ITEM_A_ID)).toBe(false);
    });
});
