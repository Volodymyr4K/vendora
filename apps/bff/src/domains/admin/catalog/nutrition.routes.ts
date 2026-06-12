/**
 * Phase 1.4: Nutrition facet (capability "nutrition").
 * Create/update ItemNutritionFacet only if tenant has capability "nutrition"; else 4xx.
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { hasCapability } from "@vendora/contracts";
import { AdminDeps } from "../types.js";

const zNutritionFacetBody = z.object({
    caloriesKcal: z.number().int().nonnegative().optional(),
    proteinG: z.number().int().nonnegative().optional(),
    fatG: z.number().int().nonnegative().optional(),
    carbsG: z.number().int().nonnegative().optional(),
});

export const nutritionRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // PUT /:branchSlug/catalog-items/:id/nutrition — upsert nutrition facet (Phase 1.4)
    app.put(
        "/:branchSlug/catalog-items/:id/nutrition",
        {
            schema: {
                params: z.object({ branchSlug: z.string(), id: z.string() }),
                body: zNutritionFacetBody,
            },
        },
        async (req, reply) => {
            const tenantId = req.tenant!.id;
            const features = req.tenant!.features;

            // Phase 1.4: Invariant — facet write only if capability "nutrition" enabled
            if (!hasCapability(features, "nutrition")) {
                return reply.code(403).send({
                    error: "Nutrition facet is not enabled for this tenant",
                    code: "CAPABILITY_REQUIRED",
                    requiredCapability: "nutrition",
                });
            }

            const { id: catalogItemId } = req.params;
            const body = req.body;

            const item = await deps.prisma.catalogItem.findFirst({
                where: { id: catalogItemId, tenantId },
            });
            if (!item) {
                return reply.code(404).send({ error: "Item not found" });
            }

            const facet = await deps.prisma.itemNutritionFacet.upsert({
                where: { catalogItemId },
                create: {
                    tenantId,
                    catalogItemId,
                    caloriesKcal: body.caloriesKcal ?? null,
                    proteinG: body.proteinG ?? null,
                    fatG: body.fatG ?? null,
                    carbsG: body.carbsG ?? null,
                },
                update: {
                    caloriesKcal: body.caloriesKcal ?? undefined,
                    proteinG: body.proteinG ?? undefined,
                    fatG: body.fatG ?? undefined,
                    carbsG: body.carbsG ?? undefined,
                },
            });

            return facet;
        }
    );

    // GET /:branchSlug/catalog-items/:id/nutrition — read nutrition facet (no capability gate on read)
    app.get<{ Params: { branchSlug: string; id: string } }>(
        "/:branchSlug/catalog-items/:id/nutrition",
        async (req, reply) => {
            const tenantId = req.tenant!.id;
            const { id: catalogItemId } = req.params;

            const item = await deps.prisma.catalogItem.findFirst({
                where: { id: catalogItemId, tenantId },
            });
            if (!item) {
                return reply.code(404).send({ error: "Item not found" });
            }

            const facet = await deps.prisma.itemNutritionFacet.findFirst({
                where: { catalogItemId, tenantId },
            });
            if (!facet) {
                return reply.code(404).send({ error: "Nutrition data not found" });
            }

            return facet;
        }
    );
};
