/**
 * ACCESS_LEVELS Phase 3.5 read leakage: categories and menu are branch-bound via CategoryBranch.
 * Only return categories visible in this branch; only return items in those categories.
 */
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AdminDeps } from "../types.js";
import { mapCategory, mapCatalogItemToMenuItem } from "../../../utils/mappers.js";

export const menuRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    app.get<{ Params: { branchSlug: string } }>("/:branchSlug/categories", async (req, reply) => {
        const branch = await deps.prisma.branch.findFirst({
            where: { tenantId: req.tenant!.id, slug: req.params.branchSlug },
            select: { id: true },
        });
        if (!branch) return reply.code(404).send({ error: "Branch not found" });
        const categories = await deps.prisma.category.findMany({
            where: {
                tenantId: req.tenant!.id,
                categoryBranches: { some: { branchId: branch.id } },
            },
            orderBy: { title: "asc" },
        });
        return categories.map((c) => ({
            id: c.id,
            slug: c.slug,
            title: c.title,
            sortOrder: c.sortOrder,
            isAvailable: c.isAvailable,
        }));
    });

    app.get<{ Params: { branchSlug: string } }>("/:branchSlug/menu", async (req, reply) => {
        const branch = await deps.prisma.branch.findFirst({
            where: { tenantId: req.tenant!.id, slug: req.params.branchSlug },
            select: { id: true },
        });
        if (!branch) return reply.code(404).send({ error: "Branch not found" });
        // ADMIN MENU: only categories visible in this branch; only items in those categories (read leakage fix)
        const categories = await deps.prisma.category.findMany({
            where: {
                tenantId: req.tenant!.id,
                categoryBranches: { some: { branchId: branch.id } },
            },
            orderBy: { sortOrder: "asc" },
        });
        const categoryIds = categories.map((c) => c.id);
        const items = await deps.prisma.catalogItem.findMany({
            where: { tenantId: req.tenant!.id, categoryId: { in: categoryIds } },
        });

        const categoryMap = new Map(categories.map(c => [c.id, c]));

        const adminCategories = categories.map(c => ({
            ...mapCategory(c),
            sortOrder: c.sortOrder,
            isAvailable: c.isAvailable
        }));

        const adminItems = items.map(p => {
            const cat = categoryMap.get(p.categoryId);
            return {
                ...mapCatalogItemToMenuItem({
                    ...p,
                    category: cat || null
                }),
            };
        });

        return {
            categories: adminCategories,
            items: adminItems
        };
    });
};
