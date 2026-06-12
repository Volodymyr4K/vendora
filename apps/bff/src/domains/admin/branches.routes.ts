/**
 * ACCESS_LEVELS Phase 5: GET /admin/branches — list branches for tenant (owner only).
 * Used by users UI to pick branchIds when assigning BRANCH-scoped permissions.
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AdminDeps } from "./types.js";

const zBranchItem = z.object({
    id: z.string().uuid(),
    slug: z.string(),
    cityName: z.string(),
});

export const branchesRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;
    const prisma = deps.prisma;

    app.get("/branches", {
        schema: {
            response: {
                200: z.object({
                    branches: z.array(zBranchItem),
                }),
            },
        },
    }, async (req, reply) => {
        // Canonical tenant from adminContext only (no header/slug)
        const tenantId = req.adminContext!.tenantId;
        const rows = await prisma.branch.findMany({
            where: { tenantId },
            select: { id: true, slug: true, cityName: true },
        });
        // Stable sort: coalesce null/undefined cityName so order is deterministic if schema ever allows null
        const branches = [...rows].sort((a, b) =>
            (a.cityName ?? "").localeCompare(b.cityName ?? "", undefined, { sensitivity: "base" })
        );
        return reply.code(200).send({ branches });
    });
};
