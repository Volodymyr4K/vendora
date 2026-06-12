import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { AdminDeps } from "../types.js";
import { moneyFromMinor, moneyToMinor } from "../../../utils/money.js";
import { zBranchSettings, zWorkingSchedule } from "@vendora/contracts";

export const settingsRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    app.get<{ Params: { branchSlug: string } }>("/:branchSlug/settings", async (req, reply) => {
        const { branchSlug } = req.params;
        const branch = await deps.prisma.branch.findFirst({
            where: {
                slug: branchSlug,
                tenantId: req.tenant!.id  // SECURITY FIX: Prevent cross-tenant access
            }
        });
        if (!branch) return reply.code(404).send({ error: "Branch not found" });

        return {
            address: branch.address,
            phones: branch.phones,
            deliveryFee: moneyFromMinor(branch.deliveryFee),
            freeFrom: moneyFromMinor(branch.freeFrom),
            etaMin: branch.etaMin,
            etaMax: branch.etaMax,
            isActive: branch.isActive,
            // Scheduled Orders
            isScheduledOrderingEnabled: branch.isScheduledOrderingEnabled,
            minAdvanceMinutes: branch.minAdvanceMinutes,
            prepTimeMinutes: branch.prepTimeMinutes,
            // Timezone - always undefined (branch always inherits from tenant)
            // Omit timezone field entirely so UI treats it as inherited
            workingSchedule: branch.workingSchedule == null ? undefined : zWorkingSchedule.parse(branch.workingSchedule),
        };
    });

    app.patch<{ Params: { branchSlug: string } }>("/:branchSlug/settings", async (req, reply) => {
        const { branchSlug } = req.params;
        const parsed = zBranchSettings.safeParse(req.body);
        
        if (!parsed.success) {
            return reply.code(400).send({
                error: "VALIDATION_ERROR",
                message: "Invalid request body",
                issues: parsed.error.issues
            });
        }
        
        const body = parsed.data;

        const result = await deps.prisma.branch.updateMany({
            where: {
                slug: branchSlug,
                tenantId: req.tenant!.id // SCOPED
            },
            data: {
                address: body.address,
                phones: body.phones,
                deliveryFee: moneyToMinor(body.deliveryFee),
                freeFrom: moneyToMinor(body.freeFrom),
                etaMin: body.etaMin,
                etaMax: body.etaMax,
                isActive: body.isActive,

                // Scheduled Orders
                isScheduledOrderingEnabled: body.isScheduledOrderingEnabled,
                minAdvanceMinutes: body.minAdvanceMinutes,
                prepTimeMinutes: body.prepTimeMinutes,

                // Timezone - always set to null (branch always inherits from tenant)
                // Explicitly clear any existing override values
                timezone: null,

                // Structured Schedule
                workingSchedule: body.workingSchedule ?? undefined
            }
        });

        if (result.count === 0) return reply.code(404).send({ error: "Branch not found or access denied" });

        // Invalidate caches to ensure immediate consistency - TENANT-SCOPED
        // Note: Using manual deletion here as Settings are a simple single-entity cache, 
        // unlike Menu which requires a complex recursive builder.
        await deps.cache.del(`tenant:${req.tenant!.id}:branches:${branchSlug}`);
        await deps.cache.del(`tenant:${req.tenant!.id}:delivery:${branchSlug}`);

        return { success: true };
    });
};
