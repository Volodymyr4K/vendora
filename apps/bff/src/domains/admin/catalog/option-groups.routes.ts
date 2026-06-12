/**
 * Phase 2.2: OptionGroup and OptionItem (modifiers) — CRUD, tenant-scoped.
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AdminDeps } from "../types.js";

const zOptionGroupCreate = z.object({
    name: z.string().min(1),
    min: z.number().int().nonnegative().optional(),
    max: z.number().int().nonnegative().optional(),
    isRequired: z.boolean().optional(),
});
const zOptionGroupUpdate = zOptionGroupCreate.partial();

const zOptionItemCreate = z.object({
    name: z.string().min(1),
    priceDeltaCents: z.number().int().optional(),
    isDefault: z.boolean().optional(),
});
const zOptionItemUpdate = zOptionItemCreate.partial();

const zAttachOptionGroup = z.object({ optionGroupId: z.string().uuid() });

export const optionGroupsRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // List option groups
    app.get<{ Params: { branchSlug: string } }>("/:branchSlug/option-groups", async (req) => {
        const groups = await deps.prisma.optionGroup.findMany({
            where: { tenantId: req.tenant!.id },
            orderBy: { name: "asc" },
            include: { _count: { select: { optionItems: true } } },
        });
        return groups.map((g) => ({
            id: g.id,
            name: g.name,
            min: g.min,
            max: g.max,
            isRequired: g.isRequired,
            optionItemsCount: g._count.optionItems,
        }));
    });

    // Create option group
    app.post("/:branchSlug/option-groups", {
        schema: { body: zOptionGroupCreate, params: z.object({ branchSlug: z.string() }) },
    }, async (req, _reply) => {
        const body = req.body;
        const group = await deps.prisma.optionGroup.create({
            data: {
                tenantId: req.tenant!.id,
                name: body.name,
                min: body.min ?? null,
                max: body.max ?? null,
                isRequired: body.isRequired ?? false,
            },
        });
        return group;
    });

    // Update option group
    app.patch("/:branchSlug/option-groups/:id", {
        schema: { body: zOptionGroupUpdate, params: z.object({ branchSlug: z.string(), id: z.string() }) },
    }, async (req, reply) => {
        const { id } = req.params;
        const body = req.body;
        const existing = await deps.prisma.optionGroup.findUnique({
            where: { tenantId_id: { tenantId: req.tenant!.id, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Option group not found" });
        const updated = await deps.prisma.optionGroup.update({
            where: { tenantId_id: { tenantId: req.tenant!.id, id } },
            data: {
                ...(body.name !== undefined && { name: body.name }),
                ...(body.min !== undefined && { min: body.min }),
                ...(body.max !== undefined && { max: body.max }),
                ...(body.isRequired !== undefined && { isRequired: body.isRequired }),
            },
        });
        return updated;
    });

    // Delete option group
    app.delete<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/option-groups/:id", async (req, reply) => {
        const { id } = req.params;
        const existing = await deps.prisma.optionGroup.findUnique({
            where: { tenantId_id: { tenantId: req.tenant!.id, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Option group not found" });
        await deps.prisma.optionGroup.delete({ where: { tenantId_id: { tenantId: req.tenant!.id, id } } });
        return { success: true };
    });

    // List option items for a group
    app.get<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/option-groups/:id/options", async (req, reply) => {
        const { id: optionGroupId } = req.params;
        const group = await deps.prisma.optionGroup.findFirst({
            where: { id: optionGroupId, tenantId: req.tenant!.id },
        });
        if (!group) return reply.code(404).send({ error: "Option group not found" });
        const items = await deps.prisma.optionItem.findMany({
            where: { optionGroupId, tenantId: req.tenant!.id },
            orderBy: { name: "asc" },
        });
        return items;
    });

    // Create option item
    app.post("/:branchSlug/option-groups/:id/options", {
        schema: { body: zOptionItemCreate, params: z.object({ branchSlug: z.string(), id: z.string() }) },
    }, async (req, reply) => {
        const { id: optionGroupId } = req.params;
        const body = req.body;
        const group = await deps.prisma.optionGroup.findFirst({
            where: { id: optionGroupId, tenantId: req.tenant!.id },
        });
        if (!group) return reply.code(404).send({ error: "Option group not found" });
        const item = await deps.prisma.optionItem.create({
            data: {
                tenantId: req.tenant!.id,
                optionGroupId,
                name: body.name,
                priceDeltaCents: body.priceDeltaCents ?? null,
                isDefault: body.isDefault ?? false,
            },
        });
        return item;
    });

    // Update option item
    app.patch("/:branchSlug/option-groups/:optionGroupId/options/:id", {
        schema: {
            body: zOptionItemUpdate,
            params: z.object({ branchSlug: z.string(), optionGroupId: z.string(), id: z.string() }),
        },
    }, async (req, reply) => {
        const { optionGroupId: _optionGroupId, id } = req.params;
        const body = req.body;
        const existing = await deps.prisma.optionItem.findUnique({
            where: { tenantId_id: { tenantId: req.tenant!.id, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Option item not found" });
        const updated = await deps.prisma.optionItem.update({
            where: { tenantId_id: { tenantId: req.tenant!.id, id } },
            data: {
                ...(body.name !== undefined && { name: body.name }),
                ...(body.priceDeltaCents !== undefined && { priceDeltaCents: body.priceDeltaCents }),
                ...(body.isDefault !== undefined && { isDefault: body.isDefault }),
            },
        });
        return updated;
    });

    // Delete option item
    app.delete<{ Params: { branchSlug: string; optionGroupId: string; id: string } }>(
        "/:branchSlug/option-groups/:optionGroupId/options/:id",
        async (req, reply) => {
            const { id } = req.params;
            const existing = await deps.prisma.optionItem.findUnique({
                where: { tenantId_id: { tenantId: req.tenant!.id, id } },
            });
            if (!existing) return reply.code(404).send({ error: "Option item not found" });
            await deps.prisma.optionItem.delete({ where: { tenantId_id: { tenantId: req.tenant!.id, id } } });
            return { success: true };
        }
    );

    // Attach option group to catalog item
    app.post("/:branchSlug/catalog-items/:id/option-groups", {
        schema: {
            body: zAttachOptionGroup,
            params: z.object({ branchSlug: z.string(), id: z.string() }),
        },
    }, async (req, reply) => {
        const { id: catalogItemId } = req.params;
        const { optionGroupId } = req.body;
        const item = await deps.prisma.catalogItem.findFirst({
            where: { id: catalogItemId, tenantId: req.tenant!.id },
        });
        if (!item) return reply.code(404).send({ error: "Item not found" });
        const group = await deps.prisma.optionGroup.findFirst({
            where: { id: optionGroupId, tenantId: req.tenant!.id },
        });
        if (!group) return reply.code(404).send({ error: "Option group not found" });
        await deps.prisma.catalogItemOptionGroup.upsert({
            where: {
                tenantId_catalogItemId_optionGroupId: {
                    tenantId: req.tenant!.id,
                    catalogItemId,
                    optionGroupId,
                },
            },
            update: {},
            create: {
                tenantId: req.tenant!.id,
                catalogItemId,
                optionGroupId,
            },
        });
        return { success: true };
    });

    // Detach option group from catalog item (verify item and group belong to tenant)
    app.delete<{ Params: { branchSlug: string; id: string; optionGroupId: string } }>(
        "/:branchSlug/catalog-items/:id/option-groups/:optionGroupId",
        async (req, reply) => {
            const { id: catalogItemId, optionGroupId } = req.params;
            const tenantId = req.tenant!.id;
            const item = await deps.prisma.catalogItem.findFirst({
                where: { id: catalogItemId, tenantId },
            });
            if (!item) return reply.code(404).send({ error: "Item not found" });
            const group = await deps.prisma.optionGroup.findFirst({
                where: { id: optionGroupId, tenantId },
            });
            if (!group) return reply.code(404).send({ error: "Option group not found" });
            const link = await deps.prisma.catalogItemOptionGroup.findUnique({
                where: {
                    tenantId_catalogItemId_optionGroupId: {
                        tenantId,
                        catalogItemId,
                        optionGroupId,
                    },
                },
            });
            if (!link) return reply.code(404).send({ error: "Link not found" });
            await deps.prisma.catalogItemOptionGroup.delete({
                where: {
                    tenantId_catalogItemId_optionGroupId: {
                        tenantId,
                        catalogItemId,
                        optionGroupId,
                    },
                },
            });
            return { success: true };
        }
    );
};
