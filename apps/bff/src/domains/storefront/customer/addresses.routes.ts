import { FastifyInstance } from "fastify";
import { zCustomerAddressCreate } from "@vendora/contracts";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";

export async function routesCustomerAddresses(fastify: FastifyInstance, deps: RoutesDependencies) {
    // GET /addresses
    fastify.get("/addresses", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "savedAddresses", "profile")) return;

        const addresses = await deps.prisma.customerAddress.findMany({
            where: { tenantId, customerId: req.customer.id },
            orderBy: { createdAt: 'desc' }
        });

        return reply.send(addresses.map(a => ({
            ...a,
            createdAt: a.createdAt.toISOString()
        })));
    });

    // POST /addresses
    fastify.post("/addresses", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "savedAddresses", "profile")) return;

        // 1. Validate Input
        const body = zCustomerAddressCreate.parse(req.body);

        // 2. Enforce Limit (Max 5) - Security Requirement
        const count = await deps.prisma.customerAddress.count({
            where: { tenantId, customerId: req.customer.id }
        });

        if (count >= 5) {
            return reply.status(400).send({
                error: "Address Limit Reached",
                message: "You can save up to 5 addresses. Please delete an old one to add a new one."
            });
        }

        // 3. Create
        const newAddress = await deps.prisma.customerAddress.create({
            data: {
                tenantId,
                customerId: req.customer.id,
                ...body
            }
        });

        return reply.send({
            ...newAddress,
            createdAt: newAddress.createdAt.toISOString()
        });
    });

    // DELETE /addresses/:id
    fastify.delete("/addresses/:id", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "savedAddresses", "profile")) return;
        const { id } = req.params as { id: string };

        const res = await deps.prisma.customerAddress.deleteMany({
            where: { tenantId, customerId: req.customer.id, id }
        });

        if (res.count !== 1) {
            return reply.status(404).send({ error: "Address not found" });
        }

        return reply.send({ success: true });
    });
}
