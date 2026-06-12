/**
 * Phase 5.2: Allergens facet (capability "allergens").
 * Create/update ItemAllergenFacet only if tenant has capability "allergens"; else 4xx.
 * Read-path: do not return facet when capability disabled (ignore facet in results).
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { hasCapability } from "@vendora/contracts";
import { AdminDeps } from "../types.js";

const zAllergenFacetBody = z.object({
    allergenCodes: z.array(z.string().min(1)).default([]),
});

export const allergensRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // PUT /:branchSlug/catalog-items/:id/allergens — upsert allergen facet (Phase 5.2)
    app.put(
        "/:branchSlug/catalog-items/:id/allergens",
        {
            schema: {
                params: z.object({ branchSlug: z.string(), id: z.string() }),
                body: zAllergenFacetBody,
            },
        },
        async (req, reply) => {
            const tenantId = req.tenant!.id;
            const features = req.tenant!.features;

            if (!hasCapability(features, "allergens")) {
                return reply.code(403).send({
                    error: "Allergens facet is not enabled for this tenant",
                    code: "CAPABILITY_REQUIRED",
                    requiredCapability: "allergens",
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

            const facet = await deps.prisma.itemAllergenFacet.upsert({
                where: { catalogItemId },
                create: {
                    tenantId,
                    catalogItemId,
                    allergenCodes: body.allergenCodes,
                },
                update: {
                    allergenCodes: body.allergenCodes,
                },
            });

            return facet;
        }
    );

    // GET /:branchSlug/catalog-items/:id/allergens — read allergen facet (Phase 5.2: ignore when capability disabled)
    // No DB read before capability check; same 404 body for "no capability" and "no record" to avoid side-channel.
    const ALLERGENS_NOT_AVAILABLE = { error: "Allergens data not available" };

    app.get<{ Params: { branchSlug: string; id: string } }>(
        "/:branchSlug/catalog-items/:id/allergens",
        async (req, reply) => {
            const tenantId = req.tenant!.id;
            const features = req.tenant!.features;
            const { id: catalogItemId } = req.params;

            if (!hasCapability(features, "allergens")) {
                return reply.code(404).send(ALLERGENS_NOT_AVAILABLE);
            }

            const item = await deps.prisma.catalogItem.findFirst({
                where: { id: catalogItemId, tenantId },
            });
            if (!item) {
                return reply.code(404).send(ALLERGENS_NOT_AVAILABLE);
            }

            const facet = await deps.prisma.itemAllergenFacet.findFirst({
                where: { tenantId, catalogItemId },
            });
            if (!facet) {
                return reply.code(404).send(ALLERGENS_NOT_AVAILABLE);
            }

            return facet;
        }
    );
};
