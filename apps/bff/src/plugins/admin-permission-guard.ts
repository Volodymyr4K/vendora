/**
 * ACCESS_LEVELS Phase 3: Guard for /admin/* — Gate №1 (enabled module), permission (view/edit), ownerOnly, capability.
 * Phase 3.5: branchScoped routes — branch check from DB (not JWT); allowedBranchIds: [] → 403 BRANCH_DENIED.
 * Order: NO_CONTEXT → NO_REGISTRY_ENTRY → MODULE_DISABLED → OWNER_ONLY_DENIED → PERMISSION_DENIED → BRANCH_DENIED → CAPABILITY_DENIED.
 * If role = TENANT_OWNER, capability and branch-scope checks are skipped; Gate №1 still applies.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import type { PrismaClient } from "@vendora/database";
import { isAdminModuleEnabled } from "@vendora/contracts";
import { getRouteId } from "../lib/get-route-id.js";
import { getAdminRouteEntry } from "../lib/admin-route-registry.js";
import { AdminGuardDenialReason } from "../lib/admin-guard-denial-reasons.js";
import { loadTenantAdminContext } from "../lib/admin-context.js";

// ACCESS_LEVELS Phase 6.1: GET /me = context for menu; must not depend on a specific module (e.g. admin_dashboard).
// When dashboard is disabled but orders/users enabled, /admin/me must still work so menu can filter by permissions.
const ADMIN_ROUTE_WHITELIST = new Set<string>(["GET /me"]);
// Phase 3.5: on write, adminWriteContextPlugin already refreshed req.adminContext; avoid double DB load.
// Invariant: adminWriteContextPlugin must run before this guard (see index.ts / test setup) so write gets fresh context.
const WRITE_METHODS = new Set<string>(["POST", "PUT", "PATCH", "DELETE"]);
// Minimal: non-business routeIds only. Every entry = security exception, code review.

interface AdminPermissionGuardOptions {
    prisma: PrismaClient;
}

function deny(
    reply: FastifyReply,
    req: FastifyRequest,
    reason: string,
    routeId: string
) {
    const tenantId = req.adminContext?.tenantId ?? req.user?.tenantId ?? "";
    const userId = req.user?.userId ?? "";
    if (req.log) {
        req.log.debug(
            { routeId, tenantId, userId, reason },
            "Admin guard denied"
        );
    }
    return reply.code(403).send({
        error: "Forbidden",
        code: "FORBIDDEN",
    });
}

export async function adminPermissionGuardPlugin(
    app: FastifyInstance,
    opts: AdminPermissionGuardOptions
) {
    const { prisma } = opts;

    app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) => {
        if (!req.adminContext) {
            const routeId = getRouteId(req);
            return deny(
                reply,
                req,
                AdminGuardDenialReason.NO_CONTEXT,
                routeId
            );
        }

        const routeId = getRouteId(req);
        if (ADMIN_ROUTE_WHITELIST.has(routeId)) return;

        const entry = getAdminRouteEntry(routeId);
        if (!entry) {
            return deny(
                reply,
                req,
                AdminGuardDenialReason.NO_REGISTRY_ENTRY,
                routeId
            );
        }

        const { role, permissions } = req.adminContext;
        const features = req.tenant?.features;

        if (!isAdminModuleEnabled(features, entry.moduleId)) {
            return deny(
                reply,
                req,
                AdminGuardDenialReason.MODULE_DISABLED,
                routeId
            );
        }

        if (entry.ownerOnly && role !== "TENANT_OWNER") {
            return deny(
                reply,
                req,
                AdminGuardDenialReason.OWNER_ONLY_DENIED,
                routeId
            );
        }

        if (role === "TENANT_ADMIN") {
            const perm = permissions?.[entry.moduleId];
            const needView = entry.action === "read";
            const needEdit = entry.action === "write";
            const hasView = perm?.canView === true;
            const hasEdit = perm?.canEdit === true;
            if (needView && !hasView) {
                return deny(
                    reply,
                    req,
                    AdminGuardDenialReason.PERMISSION_DENIED,
                    routeId
                );
            }
            if (needEdit && !hasEdit) {
                return deny(
                    reply,
                    req,
                    AdminGuardDenialReason.PERMISSION_DENIED,
                    routeId
                );
            }
        }

        // Phase 3.5: branchScoped — resolve branch from params, check allowedBranchIds from DB (not JWT).
        if (entry.branchScoped) {
            const params = req.params as { branchSlug?: string; branch?: string };
            const branchSlug = params.branchSlug ?? params.branch;
            if (!branchSlug || typeof branchSlug !== "string") {
                return deny(reply, req, AdminGuardDenialReason.BRANCH_DENIED, routeId);
            }
            const tenantId = req.adminContext!.tenantId;
            const branch = await prisma.branch.findFirst({
                where: { tenantId, slug: branchSlug },
                select: { id: true, tenantId: true },
            });
            if (!branch || branch.tenantId !== tenantId) {
                return deny(reply, req, AdminGuardDenialReason.BRANCH_DENIED, routeId);
            }
            if (role === "TENANT_ADMIN") {
                // Write: req.adminContext already DB-refreshed by adminWriteContextPlugin; avoid double load.
                const ctx = WRITE_METHODS.has(req.method)
                    ? req.adminContext
                    : await loadTenantAdminContext(prisma, tenantId, req.user?.userId ?? "");
                if (!ctx) {
                    return deny(reply, req, AdminGuardDenialReason.BRANCH_DENIED, routeId);
                }
                const perm = ctx.permissions?.[entry.moduleId];
                const allowed = perm?.allowedBranchIds;
                if (allowed === undefined) {
                    return deny(reply, req, AdminGuardDenialReason.BRANCH_DENIED, routeId);
                }
                if (Array.isArray(allowed) && allowed.length === 0) {
                    return deny(reply, req, AdminGuardDenialReason.BRANCH_DENIED, routeId);
                }
                if (Array.isArray(allowed) && !allowed.includes(branch.id)) {
                    return deny(reply, req, AdminGuardDenialReason.BRANCH_DENIED, routeId);
                }
            }
        }

        if (role === "TENANT_ADMIN" && entry.requiresCapability && entry.capabilityId) {
                const cap = await prisma.userCapability.findFirst({
                    where: {
                        tenantId: req.adminContext.tenantId,
                        userId: req.user?.userId ?? "",
                        capabilityId: entry.capabilityId,
                    },
                });
                if (!cap) {
                    return deny(
                        reply,
                        req,
                        AdminGuardDenialReason.CAPABILITY_DENIED,
                        routeId
                    );
                }
        }
        // TENANT_OWNER: capability checks skipped (policy); Gate №1 already passed.
    });
}
