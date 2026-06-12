import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { moneyFromMinor, moneyToMinor } from "../../../utils/money.js";
import { AdminDeps } from "../types.js";
import { zDashboardStats } from "@vendora/contracts";
import { ADMIN_MODULE_IDS, isAdminModuleEnabled } from "@vendora/contracts";
import type { AdminModuleId } from "@vendora/contracts";
import type { TenantFeatures } from "@vendora/contracts";

/** Runtime validation: only canonical admin module IDs (SSOT from contracts). */
const zAdminModuleId = z.enum(ADMIN_MODULE_IDS as unknown as [string, ...string[]]);
const zEnabledAdminModuleIds = z.array(zAdminModuleId);

export const dashboardRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // ACCESS_LEVELS Phase 6.1: current user context for menu (role, permissions, enabled module IDs).
    // Phase 6.3: isSuperAdmin when User.role === SUPER_ADMIN so UI can show "manage modules in Super Admin panel".
    const zAdminMeResponse = z.object({
        role: z.enum(["TENANT_OWNER", "TENANT_ADMIN"]),
        permissions: z
            .record(
                z.string(),
                z.object({
                    canView: z.boolean(),
                    canEdit: z.boolean(),
                    allowedBranchIds: z.array(z.string()).nullable(),
                })
            )
            .nullable(),
        enabledAdminModuleIds: zEnabledAdminModuleIds,
        isSuperAdmin: z.boolean().optional(),
    });
    app.get("/me", {
        schema: { response: { 200: zAdminMeResponse } },
    }, async (req, reply) => {
        const ctx = req.adminContext!;
        const features = req.tenant?.features as TenantFeatures | null | undefined;
        const enabledAdminModuleIds = (ADMIN_MODULE_IDS as readonly string[]).filter(
            (id) => isAdminModuleEnabled(features, id as AdminModuleId)
        );
        let isSuperAdmin = false;
        const userId = (req.user as { userId?: string })?.userId;
        if (userId) {
            try {
                const user = await deps.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
                isSuperAdmin = user?.role === "SUPER_ADMIN";
            } catch (err) {
                req.log.warn({ err, userId }, "User.role lookup failed for isSuperAdmin; omitting flag");
            }
        }
        return reply.send({
            role: ctx.role,
            permissions: ctx.permissions ?? null,
            enabledAdminModuleIds,
            ...(isSuperAdmin ? { isSuperAdmin: true } : {}),
        });
    });

    // Helper: Returns number if finite, else undefined
    const safeNumber = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) ? n : undefined;
    };

    // Schema for Safe Parsing
    const zLegacyPayload = z.object({
        quote: z.object({
            subtotal: z.union([z.string(), z.number()]).transform(safeNumber).optional(),
            deliveryFee: z.union([z.string(), z.number()]).transform(safeNumber).optional(),
            lines: z.array(z.object({
                name: z.string().optional(),
                title: z.string().optional(),
                qty: z.union([z.string(), z.number()]).transform(safeNumber).optional(),
                quantity: z.union([z.string(), z.number()]).transform(safeNumber).optional(),
            })).optional()
        }).optional(),
        items: z.array(z.object({
            name: z.string().optional(),
            title: z.string().optional(),
            qty: z.union([z.string(), z.number()]).transform(safeNumber).optional(),
            quantity: z.union([z.string(), z.number()]).transform(safeNumber).optional(),
        })).optional()
    }).passthrough();

    // --- Dashboard Stats (With Zod Schema Validation) ---
    app.get<{ Params: { branchSlug: string } }>(
        "/:branchSlug/stats",
        {
            schema: {
                params: z.object({
                    branchSlug: z.string().describe('Branch slug identifier')
                }),
                response: {
                    200: zDashboardStats
                }
            }
        },
        async (req, _reply) => {
            const { branchSlug } = req.params;
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            try {
                const orders = await deps.prisma.order.findMany({
                    where: {
                        branchSlug,
                        createdAt: { gte: today },
                        tenantId: req.tenant!.id
                    }
                });

                let foodRevenue = 0;
                let deliveryRevenue = 0;
                let doneCount = 0;
                let cancelledCount = 0;
                let inProgressCount = 0;
                let skippedOrdersCount = 0;
                const productCounts: Record<string, number> = {};

                for (const o of orders) {
                    const status = String(o.status || "").toUpperCase();

                    // 1. Strict Validation
                    const payloadResult = zLegacyPayload.safeParse(o.payload);

                    if (!payloadResult.success) {
                        // CRITICAL: True Skip. Do not pollute stats with guessed data.
                        skippedOrdersCount++;
                        req.log.warn({ orderId: o.id, err: payloadResult.error }, "Stats: Skipped malformed order");
                        continue;
                    }

                    const payload = payloadResult.data;

                    // --- LOGIC ---
                    if (['DELIVERED', 'COMPLETED', 'DONE'].includes(status)) {

                        // REVENUE CALCULATION
                        let orderFoodRevenue = 0;
                        let orderDeliveryRevenue = 0;
                        let revenueFound = false;

                        // Strategy A: Quote (Preferred)
                        if (payload?.quote?.subtotal !== undefined) {
                            orderFoodRevenue = moneyToMinor(payload.quote.subtotal);
                            orderDeliveryRevenue = moneyToMinor(payload.quote.deliveryFee ?? 0);
                            revenueFound = true;
                        }
                        // Strategy B: Fallback to Total (Legacy)
                        else {
                            const safeTotal = safeNumber(o.total);
                            if (safeTotal !== undefined) {
                                // ASSUMPTION: o.total is stored in Minor Units (cents) in DB
                                orderFoodRevenue = safeTotal;
                                revenueFound = true;
                            }
                        }

                        if (!revenueFound) {
                            // If we can't find money, we can't count this as a valid financial stat
                            skippedOrdersCount++;
                            req.log.warn({ orderId: o.id }, "Stats: Skipped order with no revenue data");
                            continue;
                        }

                        // If we reached here, data is valid. Commit to stats.
                        doneCount++;
                        foodRevenue += orderFoodRevenue;
                        deliveryRevenue += orderDeliveryRevenue;

                        // PRODUCTS
                        const lines = payload?.quote?.lines || payload?.items || [];
                        for (const item of lines) {
                            const name = (item.name || item.title || "Unknown").trim();
                            // Logic: 'qty' ?? 'quantity' ?? 1
                            const rawQty = item.qty ?? item.quantity;
                            const qty = rawQty !== undefined ? rawQty : 1;

                            if (name) {
                                const key = name.toLowerCase();
                                productCounts[key] = (productCounts[key] || 0) + qty;
                            }
                        }
                    }
                    else if (['CANCELLED', 'CANCEL'].includes(status)) {
                        cancelledCount++;
                    }
                    else {
                        inProgressCount++;
                    }
                }

                const topProducts = Object.entries(productCounts)
                    .map(([title, count]) => ({ title, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 3);

                // Math is safe because doneCount only includes valid orders
                const avgCheck = doneCount > 0 ? Math.round(foodRevenue / doneCount) : 0;

                return {
                    meta: {
                        isDegraded: false,
                        skippedOrders: skippedOrdersCount
                    },
                    revenue: moneyFromMinor(foodRevenue),
                    deliveryRevenue: moneyFromMinor(deliveryRevenue),
                    avgCheck: moneyFromMinor(avgCheck),
                    orders: { done: doneCount, cancelled: cancelledCount, inProgress: inProgressCount },
                    topProducts
                };

            } catch (fatalError) {
                req.log.error({ err: fatalError, branchSlug }, "Stats Critical Failure");

                return {
                    meta: { isDegraded: true, skippedOrders: 0 },
                    revenue: 0,
                    deliveryRevenue: 0,
                    avgCheck: 0,
                    orders: { done: 0, cancelled: 0, inProgress: 0 },
                    topProducts: []
                };
            }
        });
};
