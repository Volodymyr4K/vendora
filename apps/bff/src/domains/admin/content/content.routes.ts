import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { Prisma } from "@vendora/database";
import type { AdminDeps } from "../types.js";
import { zAmContentV1 } from "@vendora/contracts";
import { cacheManager } from "../../../services/cache-manager.js";

export const contentRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    app.get("/content", async (req, reply) => {
        const tenantId = req.tenant!.id;
        const tenant = await deps.prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { settings: true },
        });

        const raw = (tenant?.settings as Record<string, unknown> | null | undefined)?.amContent;
        const parsed = zAmContentV1.safeParse(raw);
        if (!parsed.success) {
            req.log.warn({ issues: parsed.error.issues }, "Invalid amContent in tenant settings");
            return reply.send({ amContent: null });
        }

        return reply.send({ amContent: parsed.data });
    });

    app.patch<{ Body: { amContent: unknown | null } }>("/content", {
        schema: {
            body: z.object({
                amContent: zAmContentV1.nullable(),
            }),
        },
    }, async (req, reply) => {
        const tenantId = req.tenant!.id;
        const amContent = req.body.amContent;

        const valueJson = Prisma.sql`${JSON.stringify(amContent)}`;
        await deps.prisma.$executeRaw(
            Prisma.sql`
                UPDATE "Tenant"
                SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{amContent}', (${valueJson})::jsonb)
                WHERE id = ${tenantId}
            `
        );

        cacheManager.invalidateTenant(tenantId);

        return reply.send({ amContent });
    });
};
