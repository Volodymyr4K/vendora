import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { zOrderSummary, zUpdateOrderStatus, zOrderStatus, zRescheduleOrderRequest } from "@vendora/contracts";
import { moneyFromMinor } from "../../../utils/money.js";
import { AdminDeps } from "../types.js";
import { stageEvent } from "../../../services/outbox/stager.js";
import { updateOrder, PAYLOAD_UPDATE_FORBIDDEN } from "../../../services/order-update.js";

export const orderRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;



    app.get<{ Params: { branchSlug: string } }>("/:branchSlug/orders", {
        schema: {
            params: z.object({
                branchSlug: z.string()
            }),
            response: {
                200: z.array(zOrderSummary)
            }
        }
    }, async (req, _reply) => {
        const { branchSlug } = req.params;

        const orders = await deps.prisma.order.findMany({
            where: {
                branchSlug,
                tenantId: req.tenant!.id // SCOPED
            },
            orderBy: { createdAt: "desc" },
            take: 50,
        });

        // Define a minimal shape for the payload we expect
        type MinimalPayload = {
            customer?: { name?: string; phone?: string };
        };

        const mapped = orders.map((o) => {
            const payload = o.payload as unknown as MinimalPayload;

            return {
                token: o.token,
                orderId: o.orderId,
                status: o.status,
                // PRICE FIX: Divide by 100
                total: moneyFromMinor(Number(o.total)),
                // PHONE FIX: Pass raw value, zPhoneResilient normalizes it
                customer: {
                    name: payload.customer?.name || "Guest",
                    phone: payload.customer?.phone || ""
                },
                createdAt: o.createdAt.toISOString(),
                updatedAt: o.updatedAt.toISOString(),
                requestedDeliveryTime: o.requestedDeliveryTime ? o.requestedDeliveryTime.toISOString() : null,
                fireAt: o.fireAt ? o.fireAt.toISOString() : null,
            };
        });

        // Valid items only (Strict Contract)
        const validOrders = mapped.filter(item => {
            const res = zOrderSummary.safeParse(item);
            if (!res.success) {
                app.log.warn({ orderId: item.orderId, err: res.error }, "Invalid Order Data (filtered out)");
                return false;
            }
            return true;
        });

        if (validOrders.length !== mapped.length) {
            const invalidCount = mapped.length - validOrders.length;
            const totalCount = mapped.length;
            const ratio = totalCount > 0 ? (invalidCount / totalCount) : 0;

            const baseLog = {
                branchSlug,
                totalCount,
                invalidCount,
                ratio,
                requestId: req.id
            };

            // Alert Threshold: >= 10 invalid items OR >= 5% of total
            if (invalidCount >= 10 || ratio >= 0.05) {
                app.log.error({
                    ...baseLog,
                    type: "ORDERS_FILTERED_INVALID_ALERT",
                }, "🚨 High rate of invalid orders filtered");
            } else {
                app.log.warn({
                    ...baseLog,
                    type: "ORDERS_FILTERED_INVALID",
                }, "Some orders were filtered due to schema validation failures");
            }
        }

        return validOrders;
    });

    app.patch<{ Params: { branchSlug: string; orderId: string } }>("/:branchSlug/orders/:orderId/status", {
        schema: {
            response: {
                200: z.object({
                    success: z.boolean(),
                    status: zOrderStatus,
                    orderId: z.string()
                })
            }
        }
    }, async (req, reply) => {
        const { branchSlug, orderId } = req.params;
        const body = zUpdateOrderStatus.parse(req.body);

        // Security: Use find + update in transaction to enforce tenantId and capture old state
        const result = await deps.prisma.$transaction(async (tx) => {
            const current = await tx.order.findFirst({
                where: { orderId, tenantId: req.tenant!.id }
            });

            if (!current) {
                throw new Error("ORDER_NOT_FOUND");
            }

            const oldStatus = current.status;

            await updateOrder(tx, { tenantId: req.tenant!.id, id: current.id }, { status: body.status });

            // Phase 3: Vendora Event Bus -> Outbox Stager
            await stageEvent(
                tx,
                "order.status_updated",
                {
                    orderId,
                    tenantId: req.tenant!.id,
                    oldStatus: oldStatus,
                    newStatus: body.status
                }
            );

            return {
                success: true,
                status: body.status,
                orderId,
                oldStatus,
                tenantId: req.tenant!.id
            };
        }).catch((err: unknown) => {
            const e = err instanceof Error ? err : new Error(String(err));
            if (e.message === "ORDER_NOT_FOUND") return reply.code(404).send({ error: "Order not found or access denied" });
            if (e.message === PAYLOAD_UPDATE_FORBIDDEN) return reply.code(409).send({ error: "Order payload is immutable and cannot be updated" });
            throw e;
        });

        // Side Effects: Notify dashboard/kitchen (Fire and Forget)
        // MOVED OUTSIDE TRANSACTION to prevent dual-write risk / phantom notifications
        // LATENCY FIX: Use "void" + .catch() to avoid blocking the response.
        if (deps.pubsub) {
            const payload = {
                type: 'ORDER_UPDATE',
                branchSlug,
                orderId,
                status: body.status,
                oldStatus: result.oldStatus, // Captured before update
                requestId: req.id
            };

            void deps.pubsub.publish(`tenant:${result.tenantId}:orders`, JSON.stringify(payload))
                .catch(err => {
                    // Fail-Safe: Log error but do not fail request
                    req.log.warn({
                        err,
                        type: "PUBSUB_PUBLISH_FAILED",
                        orderId,
                        branchSlug,
                        newStatus: body.status,
                        // oldStatus is also available if needed, but newStatus is context
                        requestId: req.id
                    }, "Failed to publish order update notification");
                });
        }

        return { success: true, status: body.status, orderId };
    });

    // PATCH /:branchSlug/orders/:orderId/reschedule
    app.patch<{ Params: { branchSlug: string; orderId: string } }>("/:branchSlug/orders/:orderId/reschedule", {
        schema: {
            response: {
                200: z.object({
                    success: z.boolean(),
                    newDeliveryTime: z.string(),
                    fireAt: z.string()
                })
            }
        }
    }, async (req, reply) => {
        const { branchSlug, orderId } = req.params;
        const { newDeliveryTime } = zRescheduleOrderRequest.parse(req.body);

        // 1. Get Branch Config for Prep Time
        const branch = await deps.prisma.branch.findFirst({
            where: { slug: branchSlug, tenantId: req.tenant!.id },
            select: { prepTimeMinutes: true }
        });
        if (!branch) return reply.code(404).send({ error: "Branch not found" });

        // 2. Calculate Fire At
        const deliveryDate = new Date(newDeliveryTime);
        const fireAt = new Date(deliveryDate);
        fireAt.setMinutes(fireAt.getMinutes() - branch.prepTimeMinutes);

        // Transactional Update
        return deps.prisma.$transaction(async (tx) => {
            const current = await tx.order.findFirst({
                where: { orderId, tenantId: req.tenant!.id },
                select: { id: true }
            });
            if (!current) throw new Error("ORDER_NOT_FOUND");

            await updateOrder(tx, { tenantId: req.tenant!.id, id: current.id }, {
                requestedDeliveryTime: deliveryDate,
                fireAt: fireAt
            });

            // 4. Stage Event
            await stageEvent(
                tx,
                "order.rescheduled",
                {
                    orderId,
                    tenantId: req.tenant!.id,
                    newDeliveryTime: deliveryDate.toISOString(),
                    newFireAt: fireAt.toISOString()
                }
            );

            return { success: true, newDeliveryTime, fireAt: fireAt.toISOString() };
        }).catch((err: unknown) => {
            const e = err instanceof Error ? err : new Error(String(err));
            if (e.message === "ORDER_NOT_FOUND") return reply.code(404).send({ error: "Order not found" });
            if (e.message === PAYLOAD_UPDATE_FORBIDDEN) return reply.code(409).send({ error: "Order payload is immutable and cannot be updated" });
            throw e;
        });
    });
};
