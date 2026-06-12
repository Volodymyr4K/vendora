import { FastifyInstance } from "fastify";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";

export async function routesCustomerFavorites(fastify: FastifyInstance, deps: RoutesDependencies) {
    // GET /favorites
    fastify.get("/favorites", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "favorites", "profile")) return;

        const favorites = await deps.prisma.customerFavorite.findMany({
            where: { tenantId, customerId: req.customer.id },
            orderBy: { createdAt: 'desc' },
            include: { catalogItem: true }
        });

        return {
            favorites: favorites.map(f => ({
                customerId: f.customerId,
                catalogItemId: f.catalogItemId,
                createdAt: f.createdAt.toISOString(),
                catalogItem: f.catalogItem
            }))
        };
    });

    // POST /favorites/:catalogItemId (Toggle) — Phase 1.3: catalogItemId
    fastify.post<{ Params: { catalogItemId: string } }>("/favorites/:catalogItemId", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "favorites", "profile")) return;

        const { catalogItemId } = req.params;

        const item = await deps.prisma.catalogItem.findFirst({
            where: { id: catalogItemId, tenantId }
        });

        if (!item) {
            return reply.status(404).send({ error: "Item not found" });
        }

        const existing = await deps.prisma.customerFavorite.findFirst({
            where: { tenantId, customerId: req.customer.id, catalogItemId }
        });

        if (existing) {
            await deps.prisma.customerFavorite.deleteMany({
                where: { tenantId, customerId: req.customer.id, catalogItemId }
            });
            return { status: "removed" };
        } else {
            await deps.prisma.customerFavorite.create({
                data: {
                    tenantId,
                    customerId: req.customer.id,
                    catalogItemId
                }
            });
            return { status: "added" };
        }
    });
}
