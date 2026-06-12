import { FastifyInstance } from "fastify";
import { prisma } from "@vendora/database";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import type { OrderPayloadComplete, OrderPayloadItem } from "../../../types/payload.js";
import { zReorderResponse } from "@vendora/contracts";

export async function routesCustomerOrders(fastify: FastifyInstance) {
    // GET /orders
    fastify.get("/orders", async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "orderHistory", "profile")) return;

        // Simple limit for now, maybe cursor later
        const orders = await prisma.order.findMany({
            where: {
                tenantId,
                customerId: req.customer.id
            },
            orderBy: { createdAt: 'desc' },
            take: 20
        });

        const mappedOrders = orders.map(o => {
            // Type-safe payload access
            const payload = o.payload as OrderPayloadComplete;
            let itemsSummary = "Order";

            // Extract items summary from payload
            if (payload?.items && Array.isArray(payload.items)) {
                itemsSummary = payload.items
                    .map((i: OrderPayloadItem) => `${i.title} x${i.quantity || 1}`)
                    .join(", ");
            }

            return {
                id: o.id,
                orderId: o.orderId,
                branchSlug: o.branchSlug,
                status: o.status,
                total: o.total,
                createdAt: o.createdAt.toISOString(),
                itemsSummary: itemsSummary
            };
        });

        return reply.send({
            orders: mappedOrders,
            nextCursor: null
        });
    });

    // POST /orders/:id/repeat
    // Re-creates a cart from a past order, checking availability and prices
    fastify.post<{ Params: { id: string } }>("/orders/:id/repeat", {
        schema: {
            response: {
                200: zReorderResponse
            }
        }
    }, async (req, reply) => {
        const { id: tenantId } = validateTenant(req);
        if (!req.customer) return reply.status(401).send({ error: "Unauthorized" });
        if (!requireStorefrontFeature(req, reply, "quickReorder", "ordering")) return;

        const { id: orderId } = req.params;

        // 1. Fetch old order (tenant-scoped: findFirst enforces tenantId in where)
        const oldOrder = await prisma.order.findFirst({
            where: { id: orderId, tenantId }
        });

        if (!oldOrder) return reply.status(404).send({ error: "Order not found" });

        // 2. Type-safe payload extraction
        const payload = oldOrder.payload as OrderPayloadComplete;
        const oldItems = payload?.items || [];

        if (oldItems.length === 0) {
            return reply.status(400).send({ error: "No items in this order" });
        }

        // 3. Fetch current catalog items to check availability/price (Phase 1.3)
        const itemIds = oldItems.map(i => i.id);
        const currentItems = await prisma.catalogItem.findMany({
            where: { id: { in: itemIds }, tenantId }
        });

        const itemMap = new Map(currentItems.map(p => [p.id, p]));

        interface CartItem {
            id: string;
            qty: number;
            title: string;
            price: number;
        }

        const newCartItems: CartItem[] = [];
        const warnings: string[] = [];

        for (const item of oldItems) {
            const catalogItem = itemMap.get(item.id);

            if (!catalogItem || catalogItem.status !== "ACTIVE") {
                warnings.push(`Товар "${catalogItem?.title || 'Unknown'}" більше не доступний`);
                continue;
            }

            newCartItems.push({
                id: catalogItem.id,
                qty: item.quantity,
                title: catalogItem.title,
                price: catalogItem.basePriceCents ?? 0
            });
        }

        if (newCartItems.length === 0) {
            return reply.status(400).send({ error: "None of the items are available anymore" });
        }

        return {
            cart: {
                items: newCartItems
            },
            warnings: warnings.length > 0 ? warnings : undefined
        };
    });
}
