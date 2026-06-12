import type { FastifyInstance } from "fastify";
import type { AppConfig } from "../../../config.js";
import { prisma } from "@vendora/database";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import type { OrderPayloadComplete } from "../../../types/payload.js";

export async function routesPublicOrders(app: FastifyInstance, deps: { config: AppConfig; prisma: typeof prisma }) {

    // GET /orders/:token
    // Public endpoint to view order status by secure token
    app.get<{ Params: { token: string } }>("/orders/:token", {
        config: {
            rateLimit: { max: 10, timeWindow: '1 minute' }
        }
    }, async (req, reply) => {
        const tenant = validateTenant(req);
        const { token } = req.params;

        // Find Order by Token (Tenant-Scoped)
        const order = await deps.prisma.order.findFirst({
            where: {
                token,
                tenantId: tenant.id
            },
            include: {
                customer: true
            }
        });

        if (!order) {
            return reply.code(404).send({ error: "Order not found" });
        }

        // Type-safe payload access
        const payload = order.payload as OrderPayloadComplete;

        // Return public status response
        return {
            token: order.token,
            orderId: order.orderId,
            status: order.status,
            updatedAt: order.updatedAt.toISOString(),
            total: order.total,
            items: payload?.items || [],
            requestedDeliveryTime: order.requestedDeliveryTime ? order.requestedDeliveryTime.toISOString() : null,
        };
    });
}
