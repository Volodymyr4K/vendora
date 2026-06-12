import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { moneyToMinor } from "../../../utils/money.js";
import { deleteFile } from "../../../utils/fileStorage.js";
import { AdminDeps } from "../types.js";
import { invalidateMenu } from "./catalog.service.js";
import { stageEvent } from "../../../services/outbox/stager.js";
import { ProductCreateSchema, ProductUpdateSchema } from "./products.schema.js";
import { zToggleProductAvailabilitySchema } from "@vendora/contracts";
import { productCreations, productUpdates, productDeletes } from "../../../lib/metrics.js";

export const productsRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // POST /products
    app.post("/:branchSlug/products", {
        schema: {
            body: ProductCreateSchema,
            params: z.object({ branchSlug: z.string() })
        }
    }, async (req, reply) => {
        // req.body is inferred from ProductCreateSchema
        const body = req.body;


        // Validate Category ID
        const category = await deps.prisma.category.findFirst({
            where: {
                id: body.categoryId,
                tenantId: req.tenant!.id
            }
        });

        if (!category) {
            return reply.code(400).send({ error: `Category with ID '${body.categoryId}' not found. Please refresh the page.` });
        }

        // Robust slug generation
        const baseSlug = body.title.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
        const suffix = Math.floor(Math.random() * 10000); // Simple randomness to avoid collisions
        const slug = `${baseSlug}-${suffix}`; // e.g. "philadelphia-roll-4921"

        const item = await deps.prisma.$transaction(async (tx) => {
            const p = await tx.catalogItem.create({
                data: {
                    slug,
                    title: body.title,
                    desc: body.desc,
                    basePriceCents: moneyToMinor(body.price),
                    weightG: body.weightG,
                    imageUrl: body.imageUrl || null,
                    categoryId: body.categoryId,
                    baseType: "GOOD",
                    status: "ACTIVE",
                    tenantId: req.tenant!.id,
                }
            });

            // Phase 2.1: Default variant — one per item, same transaction
            await tx.itemVariant.create({
                data: {
                    tenantId: req.tenant!.id,
                    catalogItemId: p.id,
                    sku: `default-${p.id}`,
                    isDefault: true,
                    isAvailable: true,
                }
            });

            // Phase 3: Outbox Pattern (Transactional Staging)
            await stageEvent(tx, "menu.updated", {
                tenantId: req.tenant!.id,
                branchSlug: req.params.branchSlug
            });

            return p;
        });

        try {
            await invalidateMenu(deps, req.tenant!.id);
        } catch (err) {
            req.log.error({ err, tenantId: req.tenant!.id }, "Failed to invalidate menu cache");
        }

        productCreations.inc({
            tenant_id: req.tenant!.id,
            category_slug: category.slug
        });

        return item;
    });

    app.patch("/:branchSlug/products/:id", {
        schema: {
            body: ProductUpdateSchema,
            params: z.object({ branchSlug: z.string(), id: z.string() })
        }
    }, async (req, reply) => {
        const { id } = req.params;
        const body = req.body;


        const oldItem = await deps.prisma.catalogItem.findFirst({
            where: { id, tenantId: req.tenant!.id }
        });

        if (!oldItem) return reply.code(404).send({ error: "Item not found" });

        const data: Parameters<typeof deps.prisma.catalogItem.update>[0]['data'] = {};
        if (body.title) data.title = body.title;
        if (body.desc !== undefined) data.desc = body.desc;
        if (body.price) data.basePriceCents = moneyToMinor(body.price);
        if (body.weightG !== undefined) data.weightG = body.weightG;

        if (body.imageUrl) {
            data.imageUrl = body.imageUrl;
            if (oldItem.imageUrl && oldItem.imageUrl !== body.imageUrl) {
                await deleteFile(oldItem.imageUrl);
            }
        }

        if (body.categoryId) {
            const cat = await deps.prisma.category.findFirst({
                where: { id: body.categoryId, tenantId: req.tenant!.id }
            });
            if (!cat) return reply.code(400).send({ error: "Category not found" });
            data.categoryId = body.categoryId;
        }

        const result = await deps.prisma.$transaction(async (tx) => {
            const res = await tx.catalogItem.updateMany({
                where: {
                    id,
                    tenantId: req.tenant!.id
                },
                data
            });

            if (res.count > 0) {
                // Phase 3: Outbox Pattern (Transactional Staging)
                await stageEvent(tx, "menu.updated", {
                    tenantId: req.tenant!.id,
                    branchSlug: req.params.branchSlug
                });
            }

            return res;
        });

        if (result.count === 0) return reply.code(404).send({ error: "Item not found or access denied" });

        // Fetch updated to return full object (updateMany doesn't return it)
        // SECURITY FIX: Re-validate tenantId on read
        // Note: We use deps.prisma here as it's a read after commit, which is fine.
        const updated = await deps.prisma.catalogItem.findFirst({
            where: { id, tenantId: req.tenant!.id }
        });
        if (!updated) return reply.code(404).send({ error: "Item not found" });

        try {
            await invalidateMenu(deps, req.tenant!.id);
        } catch (err) {
            req.log.error({ err, tenantId: req.tenant!.id }, "Failed to invalidate menu cache");
        }

        productUpdates.inc({ tenant_id: req.tenant!.id });

        return updated;
    });

    app.delete<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/products/:id", async (req, reply) => {
        const { id } = req.params;

        const item = await deps.prisma.catalogItem.findFirst({
            where: { id, tenantId: req.tenant!.id }
        });
        if (!item) return reply.code(404).send({ error: "Item not found" });

        if (item.imageUrl) {
            await deleteFile(item.imageUrl);
        }

        await deps.prisma.$transaction(async (tx) => {
            const res = await tx.catalogItem.deleteMany({
                where: {
                    id,
                    tenantId: req.tenant!.id
                }
            });

            if (res.count > 0) {
                await stageEvent(tx, "menu.updated", {
                    tenantId: req.tenant!.id,
                    branchSlug: req.params.branchSlug
                });
            }
        });

        try {
            await invalidateMenu(deps, req.tenant!.id); // Cache Bust
        } catch (err) {
            req.log.error({ err, tenantId: req.tenant!.id }, "Failed to invalidate menu cache");
        }

        // Phase 3: Business Metrics
        productDeletes.inc({ tenant_id: req.tenant!.id });

        return { success: true };
    });

    app.patch<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/products/:id/toggle-availability", async (req, reply) => {
        const { id } = req.params;
        const body = zToggleProductAvailabilitySchema.parse(req.body);

        const result = await deps.prisma.$transaction(async (tx) => {
            const res = await tx.catalogItem.updateMany({
                where: { id, tenantId: req.tenant!.id },
                data: { status: body.isAvailable ? "ACTIVE" : "ARCHIVED" }
            });

            if (res.count > 0) {
                await stageEvent(tx, "menu.updated", {
                    tenantId: req.tenant!.id,
                    branchSlug: req.params.branchSlug
                });
            }
            return res;
        });

        if (result.count === 0) return reply.code(404).send({ error: "Item not found" });

        const updated = await deps.prisma.catalogItem.findFirst({
            where: { id, tenantId: req.tenant!.id }
        });
        if (!updated) return reply.code(404).send({ error: "Item not found" });

        try {
            await invalidateMenu(deps, req.tenant!.id); // Cache Bust
        } catch (err) {
            req.log.error({ err, tenantId: req.tenant!.id }, "Failed to invalidate menu cache");
        }

        return updated;
    });
};
