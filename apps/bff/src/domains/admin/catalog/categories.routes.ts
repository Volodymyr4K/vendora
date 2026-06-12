import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AdminDeps } from "../types.js";
import { invalidateMenu } from "./catalog.service.js";
import { zCreateCategorySchema, zUpdateCategorySchema, zToggleProductAvailabilitySchema, zReorderCategoriesSchema } from "@vendora/contracts";
import { stageEvent } from "../../../services/outbox/stager.js";

export const categoriesRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // --- Category Management ---

    app.post<{ Params: { branchSlug: string } }>("/:branchSlug/categories", async (req, reply) => {
        const body = zCreateCategorySchema.parse(req.body);
        const slug = body.slug || body.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-');

        try {
            const branch = await deps.prisma.branch.findFirst({
                where: { tenantId: req.tenant!.id, slug: req.params.branchSlug },
                select: { id: true },
            });
            if (!branch) {
                return reply.code(404).send({ error: "Branch not found" });
            }

            const category = await deps.prisma.$transaction(async (tx) => {
                const cat = await tx.category.create({
                    data: {
                        title: body.title,
                        slug,
                        sortOrder: body.sortOrder,
                        tenantId: req.tenant!.id, // SCOPED
                    }
                });

                await tx.categoryBranch.create({
                    data: {
                        tenantId: req.tenant!.id,
                        categoryId: cat.id,
                        branchId: branch.id,
                    }
                });

                await stageEvent(tx, "menu.updated", {
                    tenantId: req.tenant!.id,
                    branchSlug: req.params.branchSlug
                });

                return cat;
            });

            await invalidateMenu(deps, req.tenant!.id); // Cache Bust
            return category;
        } catch (error: unknown) {
            // Handle unique constraint on slug (Prisma error code P2002)
            const err = error instanceof Error ? error : new Error(String(error));
            app.log.warn({ error: err.message, slug }, 'Category creation failed');
            return reply.code(400).send({ error: "Category creation failed. Slug might be taken." });
        }
    });

    app.patch<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/categories/:id", async (req, reply) => {
        const { id } = req.params;
        const body = zUpdateCategorySchema.parse(req.body);

        const data: Parameters<typeof deps.prisma.category.update>[0]['data'] = {};
        if (body.title) data.title = body.title;
        if (body.slug) data.slug = body.slug;
        if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;

        const result = await deps.prisma.$transaction(async (tx) => {
            const res = await tx.category.updateMany({
                where: {
                    id,
                    tenantId: req.tenant!.id
                },
                data
            });

            if (res.count > 0) {
                await stageEvent(tx, "menu.updated", {
                    tenantId: req.tenant!.id,
                    branchSlug: req.params.branchSlug
                });
            }

            return res;
        });

        if (result.count === 0) return reply.code(404).send({ error: "Category not found" });

        // SECURITY FIX: Re-validate tenantId on read
        const updated = await deps.prisma.category.findFirst({
            where: {
                id,
                tenantId: req.tenant!.id
            }
        });
        if (!updated) return reply.code(404).send({ error: "Category not found" });

        await invalidateMenu(deps, req.tenant!.id); // Cache Bust

        return updated;
    });

    app.patch<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/categories/:id/toggle-availability", async (req, reply) => {
        const { id } = req.params;
        const body = zToggleProductAvailabilitySchema.parse(req.body); // Reusing same boolean schema

        const result = await deps.prisma.$transaction(async (tx) => {
            const res = await tx.category.updateMany({
                where: {
                    id,
                    tenantId: req.tenant!.id
                },
                data: { isAvailable: body.isAvailable }
            });

            if (res.count > 0) {
                await stageEvent(tx, "menu.updated", {
                    tenantId: req.tenant!.id,
                    branchSlug: req.params.branchSlug
                });
            }

            return res;
        });

        if (result.count === 0) return reply.code(404).send({ error: "Category not found" });

        // SECURITY FIX: Re-validate tenantId on read
        const updated = await deps.prisma.category.findFirst({
            where: {
                id,
                tenantId: req.tenant!.id
            }
        });
        if (!updated) return reply.code(404).send({ error: "Category not found" });

        await invalidateMenu(deps, req.tenant!.id); // Cache Bust

        return updated;
    });

    app.patch<{ Params: { branchSlug: string } }>("/:branchSlug/categories/reorder", async (req, reply) => {
        const body = zReorderCategoriesSchema.parse(req.body);

        // SECURITY FIX: Validate all IDs belong to tenant BEFORE transaction
        const count = await deps.prisma.category.count({
            where: {
                id: { in: body.ids },
                tenantId: req.tenant!.id
            }
        });

        if (count !== body.ids.length) {
            return reply.code(403).send({
                error: "Invalid category IDs or access denied"
            });
        }

        // Transactional update - using interactive transaction for outbox support
        await deps.prisma.$transaction(async (tx) => {
            await Promise.all(body.ids.map((id, index) =>
                tx.category.updateMany({
                    where: {
                        id,
                        tenantId: req.tenant!.id // SCOPED
                    },
                    data: { sortOrder: index }
                })
            ));

            await stageEvent(tx, "menu.updated", {
                tenantId: req.tenant!.id,
                branchSlug: req.params.branchSlug
            });
        });

        await invalidateMenu(deps, req.tenant!.id); // Cache Bust

        return { success: true };
    });

    app.delete<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/categories/:id", async (req, _reply) => {
        const { id } = req.params;

        // Transactional delete with logic
        const movedProducts = await deps.prisma.$transaction(async (tx) => {
            // 1. Check if products exist in this category - SCOPED
            const countInTx = await tx.catalogItem.count({
                where: { categoryId: id, tenantId: req.tenant!.id }
            });

            if (countInTx > 0) {
                let uncat = await tx.category.findFirst({
                    where: { slug: "uncategorized", tenantId: req.tenant!.id }
                });
                if (!uncat) {
                    uncat = await tx.category.create({
                        data: {
                            title: "Uncategorized",
                            slug: "uncategorized",
                            sortOrder: 999,
                            tenantId: req.tenant!.id,
                        }
                    });
                }

                await tx.catalogItem.updateMany({
                    where: { categoryId: id, tenantId: req.tenant!.id },
                    data: { categoryId: uncat.id }
                });
            }

            await tx.category.deleteMany({
                where: { id, tenantId: req.tenant!.id }
            });

            await stageEvent(tx, "menu.updated", {
                tenantId: req.tenant!.id,
                branchSlug: req.params.branchSlug
            });

            return countInTx;
        });

        await invalidateMenu(deps, req.tenant!.id); // Cache Bust

        return { success: true, movedProducts };
    });
};
