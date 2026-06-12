/**
 * ACCESS_LEVELS: DB-check on write — before Phase 3 guard, fresh adminContext from DB on every write.
 * Mitigates stale JWT permissions: POST/PUT/PATCH/DELETE use fresh membership/permissions from DB.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@vendora/database";
import { loadTenantAdminContext } from "../lib/admin-context.js";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

interface AdminWriteContextOptions {
    prisma: PrismaClient;
}

export async function adminWriteContextPlugin(
    app: FastifyInstance,
    opts: AdminWriteContextOptions
) {
    const { prisma } = opts;

    app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
        if (!WRITE_METHODS.has(req.method)) return;

        const tenantId = req.user?.tenantId;
        const userId = req.user?.userId;
        if (!tenantId || !userId) {
            return reply.code(403).send({
                error: "Forbidden",
                code: "FORBIDDEN",
            });
        }

        const fresh = await loadTenantAdminContext(prisma, tenantId, userId);
        if (!fresh) {
            return reply.code(403).send({
                error: "Forbidden",
                code: "FORBIDDEN",
            });
        }

        req.adminContext = {
            tenantId,
            role: fresh.role,
            permissions: fresh.permissions,
        };
    });
}
