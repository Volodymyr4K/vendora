import { describe, it, expect, vi } from "vitest";
import { updateOrder, PAYLOAD_UPDATE_FORBIDDEN, type OrderUpdateAllowedData } from "../order-update.js";
import type { Order } from "@vendora/database";

describe("order-update", () => {
    const mockOrder: Order = {
        id: "ord-uuid",
        token: "tok",
        orderId: "ORD-1",
        branchSlug: "main",
        branchId: "branch-uuid", // Phase 4.3: canonical location
        status: "pending",
        total: 1000,
        currency: "UAH",
        personCount: 1,
        comment: null,
        requestedDeliveryTime: null,
        fireAt: null,
        payload: {},
        tenantId: "t1",
        customerId: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        idempotencyKey: null,
        idempotencyScope: null
    };

    describe("PAYLOAD_UPDATE_FORBIDDEN", () => {
        it("throws when data contains payload key (attempt to update payload → 4xx)", async () => {
            const tx = {
                order: {
                    update: vi.fn().mockResolvedValue(mockOrder)
                }
            };

            // Simulate caller passing payload (e.g. from raw body); runtime guard must reject
            const dataWithPayload = { status: "paid" as const, payload: {} };
            await expect(
                updateOrder(tx, { tenantId: "t1", id: "ord-uuid" }, dataWithPayload as OrderUpdateAllowedData)
            ).rejects.toThrow(PAYLOAD_UPDATE_FORBIDDEN);

            expect(tx.order.update).not.toHaveBeenCalled();
        });

        it("throws when data has only payload key", async () => {
            const tx = {
                order: {
                    update: vi.fn().mockResolvedValue(mockOrder)
                }
            };

            const dataOnlyPayload = { payload: { x: 1 } };
            await expect(
                updateOrder(tx, { tenantId: "t1", id: "ord-uuid" }, dataOnlyPayload as OrderUpdateAllowedData)
            ).rejects.toThrow(PAYLOAD_UPDATE_FORBIDDEN);

            expect(tx.order.update).not.toHaveBeenCalled();
        });
    });

    describe("whitelist", () => {
        it("calls tx.order.update with only allowed fields", async () => {
            const tx = {
                order: {
                    update: vi.fn().mockResolvedValue(mockOrder)
                }
            };

            await updateOrder(tx, { tenantId: "t1", id: "ord-uuid" }, {
                status: "paid",
                requestedDeliveryTime: new Date("2026-02-01T12:00:00Z"),
                fireAt: new Date("2026-02-01T11:30:00Z"),
                comment: "test"
            });

            expect(tx.order.update).toHaveBeenCalledTimes(1);
            expect(tx.order.update).toHaveBeenCalledWith({
                where: { tenantId_id: { tenantId: "t1", id: "ord-uuid" } },
                data: {
                    status: "paid",
                    requestedDeliveryTime: new Date("2026-02-01T12:00:00Z"),
                    fireAt: new Date("2026-02-01T11:30:00Z"),
                    comment: "test"
                }
            });
        });

        it("by token passes tenantId_token to Prisma", async () => {
            const tx = {
                order: {
                    update: vi.fn().mockResolvedValue(mockOrder)
                }
            };

            await updateOrder(tx, { tenantId: "t1", token: "tok" }, { status: "paid" });

            expect(tx.order.update).toHaveBeenCalledWith({
                where: { tenantId_token: { tenantId: "t1", token: "tok" } },
                data: { status: "paid" }
            });
        });
    });
});
