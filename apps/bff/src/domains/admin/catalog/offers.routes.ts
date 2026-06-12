/**
 * Phase 4.1: Offer (BranchListing) — CRUD, tenant-scoped. Price/availability per branch.
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AdminDeps } from "../types.js";

const zOfferCreate = z.object({
    variantId: z.string().uuid(),
    priceCents: z.number().int().nonnegative(),
    currency: z.string().min(1).optional(),
    isAvailable: z.boolean().optional(),
    stockPolicy: z.string().optional(),
    leadTime: z.number().int().nonnegative().optional(),
});
const zOfferUpdate = z.object({
    priceCents: z.number().int().nonnegative().optional(),
    currency: z.string().min(1).optional(),
    isAvailable: z.boolean().optional(),
    stockPolicy: z.string().optional().nullable(),
    leadTime: z.number().int().nonnegative().optional().nullable(),
}).strict();

export const offersRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // List offers for a branch (tenant-scoped)
    app.get<{ Params: { branchSlug: string } }>("/:branchSlug/offers", async (req, reply) => {
        const branch = await deps.prisma.branch.findFirst({
            where: { slug: req.params.branchSlug, tenantId: req.tenant!.id },
            select: { id: true },
        });
        if (!branch) return reply.code(404).send({ error: "Branch not found" });
        const offers = await deps.prisma.offer.findMany({
            where: { tenantId: req.tenant!.id, branchId: branch.id },
            include: { variant: { select: { id: true, sku: true, catalogItem: { select: { title: true } } } } },
            orderBy: { createdAt: "desc" },
        });
        return offers.map((o) => ({
            id: o.id,
            branchId: o.branchId,
            variantId: o.variantId,
            variantSku: o.variant.sku,
            itemTitle: o.variant.catalogItem.title,
            priceCents: o.priceCents,
            currency: o.currency,
            isAvailable: o.isAvailable,
            stockPolicy: o.stockPolicy,
            leadTime: o.leadTime,
        }));
    });

    // Create offer (write-path: branch and variant must belong to tenant)
    app.post<{ Params: { branchSlug: string }; Body: z.infer<typeof zOfferCreate> }>("/:branchSlug/offers", {
        schema: { body: zOfferCreate, params: z.object({ branchSlug: z.string() }) },
    }, async (req, reply) => {
        const body = req.body;
        const branch = await deps.prisma.branch.findFirst({
            where: { slug: req.params.branchSlug, tenantId: req.tenant!.id },
            select: { id: true },
        });
        if (!branch) return reply.code(404).send({ error: "Branch not found" });
        const variant = await deps.prisma.itemVariant.findFirst({
            where: { id: body.variantId, tenantId: req.tenant!.id },
            select: { id: true },
        });
        if (!variant) return reply.code(404).send({ error: "Variant not found or not in tenant" });
        const created = await deps.prisma.offer.create({
            data: {
                tenantId: req.tenant!.id,
                branchId: branch.id,
                variantId: body.variantId,
                priceCents: body.priceCents,
                currency: body.currency ?? "UAH",
                isAvailable: body.isAvailable ?? true,
                stockPolicy: body.stockPolicy ?? null,
                leadTime: body.leadTime ?? null,
            },
        });
        return created;
    });

    // Get one offer (tenant-scoped by compound key)
    app.get<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/offers/:id", async (req, reply) => {
        const offer = await deps.prisma.offer.findUnique({
            where: { tenantId_id: { tenantId: req.tenant!.id, id: req.params.id } },
            include: { branch: { select: { slug: true } }, variant: { select: { sku: true, catalogItem: { select: { title: true } } } } },
        });
        if (!offer) return reply.code(404).send({ error: "Offer not found" });
        return offer;
    });

    // Update offer (tenant-scoped by compound key)
    app.patch<{ Params: { branchSlug: string; id: string }; Body: z.infer<typeof zOfferUpdate> }>("/:branchSlug/offers/:id", {
        schema: { body: zOfferUpdate, params: z.object({ branchSlug: z.string(), id: z.string().uuid() }) },
    }, async (req, reply) => {
        const { id } = req.params;
        const body = req.body;
        const tenantId = req.tenant!.id;
        const existing = await deps.prisma.offer.findUnique({
            where: { tenantId_id: { tenantId, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Offer not found" });
        const updated = await deps.prisma.offer.update({
            where: { tenantId_id: { tenantId, id } },
            data: {
                ...(body.priceCents !== undefined && { priceCents: body.priceCents }),
                ...(body.currency !== undefined && { currency: body.currency }),
                ...(body.isAvailable !== undefined && { isAvailable: body.isAvailable }),
                ...(body.stockPolicy !== undefined && { stockPolicy: body.stockPolicy }),
                ...(body.leadTime !== undefined && { leadTime: body.leadTime }),
            },
        });
        return updated;
    });

    // Delete offer (tenant-scoped by compound key)
    app.delete<{ Params: { branchSlug: string; id: string } }>("/:branchSlug/offers/:id", async (req, reply) => {
        const { id } = req.params;
        const tenantId = req.tenant!.id;
        const existing = await deps.prisma.offer.findUnique({
            where: { tenantId_id: { tenantId, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Offer not found" });
        await deps.prisma.offer.delete({ where: { tenantId_id: { tenantId, id } } });
        return { success: true };
    });
};
