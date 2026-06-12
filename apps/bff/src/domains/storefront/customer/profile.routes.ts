import { FastifyInstance } from "fastify";
import { zCustomerUpdateProfile } from "@vendora/contracts";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";

export async function routesCustomerProfile(fastify: FastifyInstance, deps: RoutesDependencies) {
    // Helper to get full profile
    const getProfile = async (customerId: string, tenantId: string) => {
        const customer = await deps.prisma.customer.findFirstOrThrow({
            where: { id: customerId, tenantId },
            include: {
                addresses: {
                    orderBy: { createdAt: 'desc' }
                }
            }
        });

        // Map to contract
        return {
            id: customer.id,
            phone: customer.phone,
            name: customer.name,
            email: customer.email,
            lastVisitedBranchSlug: customer.lastVisitedBranchSlug,
            addresses: customer.addresses.map(a => ({
                ...a,
                createdAt: a.createdAt.toISOString()
            }))
        };
    };

    // GET /me
    fastify.get("/me", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        if (!requireStorefrontFeature(req, reply, "customerProfiles", "profile")) return;

        const profile = await getProfile(req.customer.id, tenantId);
        return reply.send(profile);
    });

    // PATCH /me
    fastify.patch("/me", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) {
            return reply.status(401).send({ error: "Unauthorized" });
        }
        if (!requireStorefrontFeature(req, reply, "customerProfiles", "profile")) return;

        const body = zCustomerUpdateProfile.parse(req.body);

        const res = await deps.prisma.customer.updateMany({
            where: { id: req.customer.id, tenantId },
            data: {
                name: body.name,
                email: body.email
            }
        });

        if (res.count !== 1) {
            return reply.status(404).send({ error: "Customer not found" });
        }

        const profile = await getProfile(req.customer.id, tenantId);
        return reply.send(profile);
    });
}
