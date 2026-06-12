import type { Order, Prisma } from "@vendora/database";

/** Error code when caller attempts to update Order.payload (forbidden). */
export const PAYLOAD_UPDATE_FORBIDDEN = "PAYLOAD_UPDATE_FORBIDDEN";

/**
 * Whitelist of fields allowed for Order updates (Phase 3.5).
 * payload is immutable; all update paths must go through this function.
 */
export type OrderUpdateAllowedData = {
    status?: string;
    requestedDeliveryTime?: Date | null;
    fireAt?: Date | null;
    comment?: string | null;
};

/**
 * Where for Order update: structurally requires tenantId so callers cannot omit tenant scope.
 * Use by id (after find by tenantId + orderId) or by token (e.g. payment flow).
 */
export type OrderUpdateWhere =
    | { tenantId: string; id: string }
    | { tenantId: string; token: string };

type OrderUpdateTx = {
    order: {
        update: (args: {
            where: Prisma.OrderWhereUniqueInput;
            data: Prisma.OrderUpdateInput;
        }) => Promise<Order>;
    };
};

function toPrismaWhere(where: OrderUpdateWhere): Prisma.OrderWhereUniqueInput {
    if ("id" in where) {
        return { tenantId_id: { tenantId: where.tenantId, id: where.id } };
    }
    return { tenantId_token: { tenantId: where.tenantId, token: where.token } };
}

/**
 * Central Order update: only whitelisted fields are written (runtime whitelist, not just TS).
 * If data contains "payload" key, throws Error(PAYLOAD_UPDATE_FORBIDDEN) → caller must return 4xx (e.g. 409).
 */
export async function updateOrder(
    tx: OrderUpdateTx,
    where: OrderUpdateWhere,
    data: OrderUpdateAllowedData
): Promise<Order> {
    if (Object.prototype.hasOwnProperty.call(data, "payload")) {
        throw new Error(PAYLOAD_UPDATE_FORBIDDEN);
    }
    const allowed: Prisma.OrderUpdateInput = {};
    if (data.status !== undefined) allowed.status = data.status;
    if (data.requestedDeliveryTime !== undefined)
        allowed.requestedDeliveryTime = data.requestedDeliveryTime;
    if (data.fireAt !== undefined) allowed.fireAt = data.fireAt;
    if (data.comment !== undefined) allowed.comment = data.comment;
    return tx.order.update({ where: toPrismaWhere(where), data: allowed });
}
