import { FastifyInstance } from "fastify";
import { z } from "zod";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import { zFeatureDisabledResponse } from "../../../schemas/storefront-errors.js";
import { DateTime } from "luxon";
import {
    getEffectiveTimezone,
    isWithinWorkingScheduleForDateTime
} from "../../../utils/timezone-helpers.js";
import { zWorkingSchedule } from "@vendora/contracts";
import type { RoutesDependencies } from "../../../types/dependencies.js";
import { computeSlotWindow } from "./slot-window.js";

export async function routesTimeSlots(app: FastifyInstance, deps: RoutesDependencies) {
    app.get<{ Querystring: { branchSlug: string } }>("/time-slots", {
        schema: {
            querystring: z.object({ branchSlug: z.string() }),
            response: {
                200: z.object({
                    slots: z.array(z.object({ value: z.string(), label: z.string(), isAvailable: z.boolean() })),
                    timezone: z.string(),
                    isScheduledOrderingEnabled: z.boolean()
                }),
                // 400: branchSlug required; 404: Branch not found — same shape { error: string }
                400: z.object({ error: z.string() }),
                403: zFeatureDisabledResponse,
                404: z.object({ error: z.string() })
            }
        }
    }, async (req, reply) => {
        const tenant = validateTenant(req);
        // Step 7 (AUDIT_6): tenant entitlement — tenant off → 403 FEATURE_DISABLED
        if (!requireStorefrontFeature(req, reply, "scheduledOrdering", "ordering")) return;

        const { branchSlug } = req.query;

        if (!branchSlug) {
            return reply.code(400).send({ error: "branchSlug required" });
        }

        const branch = await deps.prisma.branch.findFirst({
            where: { slug: branchSlug, tenantId: tenant.id },
            select: {
                isScheduledOrderingEnabled: true,
                minAdvanceMinutes: true,
                prepTimeMinutes: true,
                slotCapacity: true, // NEW
                timezone: true,
                workingSchedule: true,
                tenant: {
                    select: { timezone: true }
                }
            }
        });

        if (!branch) {
            return reply.code(404).send({ error: "Branch not found" });
        }

        const workingSchedule =
            branch.workingSchedule == null ? undefined : zWorkingSchedule.parse(branch.workingSchedule);

        // If feature disabled, return empty slots
        if (!branch.isScheduledOrderingEnabled) {
            return {
                slots: [],
                timezone: getEffectiveTimezone(branch.timezone, branch.tenant.timezone),
                isScheduledOrderingEnabled: false,
            };
        }

        // Get effective timezone
        const timezone = getEffectiveTimezone(branch.timezone, branch.tenant.timezone);
        const now = DateTime.now().setZone(timezone);

        // Compute slot window using shared helper
        const { start, end: maxTime } = computeSlotWindow(now, branch.minAdvanceMinutes);
        let current = start;

        // --- OPTIMIZATION: Batched Capacity Check (Fix 5.1) ---
        // Fetch all active orders for the relevant time range in ONE query (GroupBy)
        // Avoids N+1 queries inside the loop.
        const activeOrders = await deps.prisma.order.groupBy({
            by: ['requestedDeliveryTime'],
            where: {
                branchSlug,
                tenantId: tenant.id,
                status: { notIn: ['cancelled', 'rejected'] },
                requestedDeliveryTime: {
                    gte: current.toJSDate(),
                    lte: maxTime.toJSDate()
                }
            },
            _count: { id: true }
        });

        // Create a lookup map: ISO String -> Count
        // We use toISO() because JS Date strings can vary, logic relies on exact slot matches.
        const loadMap = new Map<string, number>();
        for (const entry of activeOrders) {
            if (entry.requestedDeliveryTime) {
                loadMap.set(entry.requestedDeliveryTime.toISOString(), entry._count.id);
            }
        }
        // -----------------------------------------------------

        const slots: Array<{ value: string; label: string; isAvailable: boolean }> = [];

        // Generate slots every 30 minutes
        while (current <= maxTime) {
            let isAvailable = true;

            // 1. Working Hours Check
            if (workingSchedule) {
                isAvailable = isWithinWorkingScheduleForDateTime({ schedule: workingSchedule, current });
            } else {
                // No workingSchedule = closed (no legacy fallback)
                isAvailable = false;
            }

            // 2. Capacity Check (NEW)
            // Only check if it's technically open first? Yes.
            if (isAvailable) {
                const currentIso = current.toJSDate().toISOString();
                const load = loadMap.get(currentIso) || 0;
                if (load >= branch.slotCapacity) {
                    isAvailable = false;
                }
            }

            // Determine label
            const isToday = current.hasSame(now, 'day');
            const isTomorrow = current.hasSame(now.plus({ days: 1 }), 'day');

            let label = current.toFormat('HH:mm');
            if (isToday) {
                label = `Today ${label}`;
            } else if (isTomorrow) {
                label = `Tomorrow ${label}`;
            } else {
                label = `${current.toFormat('dd.MM')} ${label}`;
            }

            // Only return available slots? Or all slots with isAvailable flag?
            // Requirement usually implies showing only available, or graying out.
            // Current format allows adding only isAvailable=true OR all.
            // Original code: if (isAvailable) slots.push(...) -> Only available slots returned.
            // Wait, "booked" slots might need to be hidden or shown as disabled.
            // Let's stick to original behavior (hide unavailable).
            // BUT, if it's full ("booked"), maybe we simply skip it?
            // Original code: if (isAvailable) slots.push(...)

            if (isAvailable) {
                slots.push({
                    value: current.toISO()!,
                    label,
                    isAvailable,
                });
            }

            current = current.plus({ minutes: 30 });
        }

        return {
            slots,
            timezone,
            isScheduledOrderingEnabled: true,
        };
    });
}
