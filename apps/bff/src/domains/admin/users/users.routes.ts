/**
 * ACCESS_LEVELS Phase 5: Tenant users (members) management — owner only.
 * List members, add member, update role/permissions, remove member.
 * Enforces ≥1 owner (400 LAST_OWNER) on role downgrade and owner removal.
 */

import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { TenantUserRole } from "@vendora/database";
import {
    ADMIN_MODULE_IDS,
    isAdminModuleEnabled,
    type AdminModuleId,
} from "@vendora/contracts";
import type { TenantFeatures } from "@vendora/contracts";
import { BRANCH_SCOPED_MODULE_IDS } from "../../../lib/admin-route-registry.js";
import { ensureAtLeastOneOwner, LAST_OWNER_CODE } from "../../../lib/last-owner-guard.js";
import { AdminDeps } from "../types.js";

/** Runtime validation: only canonical admin module IDs (SSOT from contracts). */
const zAdminModuleId = z.enum(ADMIN_MODULE_IDS as unknown as [string, ...string[]]);
const zEnabledAdminModuleIds = z.array(zAdminModuleId);

const zTenantUserRole = z.enum(["TENANT_OWNER", "TENANT_ADMIN"]);
const zModulePermission = z.object({
    canView: z.boolean(),
    canEdit: z.boolean(),
    /** Phase 3.5: ALL = all branches; BRANCH = only listed branchIds (optional for backward compat). */
    scopeType: z.enum(["ALL", "BRANCH"]).optional().default("ALL"),
    branchIds: z.array(z.string().uuid()).optional(),
});
/** Normalize: canEdit ⇒ canView (plan 0.3) */
function normalizePermission(p: { canView: boolean; canEdit: boolean }) {
    return { canView: p.canView || p.canEdit, canEdit: p.canEdit };
}

/** Exported for unit test: PATCH /users targetRole logic (AUDIT 7 regression). */
export function getTargetRoleForPatch(
    body: { role?: "TENANT_OWNER" | "TENANT_ADMIN" },
    membership: { role: string }
): "TENANT_OWNER" | "TENANT_ADMIN" {
    return (body.role ?? membership.role) as "TENANT_OWNER" | "TENANT_ADMIN";
}

/** Type for permissions argument of validateAndNormalizePermissions (type guard only narrows to non-undefined). */
type PermissionsRecord = Record<
    string,
    { canView: boolean; canEdit: boolean; scopeType?: "ALL" | "BRANCH"; branchIds?: string[] }
>;

/** Exported for unit test: PATCH /users — permissions apply only when targetRole is TENANT_ADMIN. */
export function shouldApplyPermissionsInPatch(
    body: { permissions?: unknown },
    targetRole: string
): body is { permissions: PermissionsRecord } {
    return body.permissions !== undefined && targetRole === "TENANT_ADMIN";
}

/** SSOT: branchIds always string[] — ALL uses [], BRANCH uses dedup list. */
type NormalizedModulePermission = {
    canView: boolean;
    canEdit: boolean;
    scopeType: "ALL" | "BRANCH";
    branchIds: string[];
};

/** Validate permissions: only enabled admin modules; normalize canEdit⇒canView; validate branchIds; forbid BRANCH for non-branch-scoped modules. */
async function validateAndNormalizePermissions(
    prisma: AdminDeps["prisma"],
    tenantId: string,
    features: TenantFeatures | null | undefined,
    permissions: Record<string, { canView: boolean; canEdit: boolean; scopeType?: "ALL" | "BRANCH"; branchIds?: string[] }>
): Promise<Record<string, NormalizedModulePermission>> {
    const out: Record<string, NormalizedModulePermission> = {};
    for (const moduleId of Object.keys(permissions) as AdminModuleId[]) {
        if (!ADMIN_MODULE_IDS.includes(moduleId)) continue;
        if (!isAdminModuleEnabled(features, moduleId)) continue;
        const p = permissions[moduleId];
        if (p === undefined) continue;
        const scopeType = p.scopeType ?? "ALL";
        let branchIds: string[];
        if (scopeType === "ALL") {
            branchIds = [];
        } else {
            if (!BRANCH_SCOPED_MODULE_IDS.has(moduleId)) {
                throw new Error(`scopeType BRANCH is not allowed for module ${moduleId}`);
            }
            const raw = p.branchIds ?? [];
            if (raw.length === 0) {
                throw new Error("scopeType BRANCH requires at least one branchId");
            }
            const unique = [...new Set(raw)];
            const branches = await prisma.branch.findMany({
                where: { id: { in: unique }, tenantId },
                select: { id: true },
            });
            const foundIds = new Set(branches.map((b) => b.id));
            if (unique.some((id) => !foundIds.has(id))) {
                throw new Error("Invalid branchIds: some branches do not belong to tenant or do not exist");
            }
            branchIds = unique;
        }
        out[moduleId] = {
            ...normalizePermission(p),
            scopeType,
            branchIds,
        };
    }
    return out;
}

export const usersRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;
    const prisma = deps.prisma;

    // GET /users — list members + enabled admin module IDs for UI (owner only; guard enforces). Phase 3.5: permissions include scopeType and branchIds.
    const zMemberPermission = z.object({
        canView: z.boolean(),
        canEdit: z.boolean(),
        scopeType: z.enum(["ALL", "BRANCH"]),
        branchIds: z.array(z.string().uuid()),
    });
    const zMember = z.object({
        userId: z.string(),
        email: z.string(),
        role: zTenantUserRole,
        permissions: z.record(z.string(), zMemberPermission).nullable(),
    });
    app.get("/users", {
        schema: {
            response: {
                200: z.object({
                    members: z.array(zMember),
                    enabledAdminModuleIds: zEnabledAdminModuleIds,
                }),
            },
        },
    }, async (req, reply) => {
        const tenantId = req.adminContext!.tenantId;
        const features = req.tenant?.features as TenantFeatures | null | undefined;
        const enabledIds = (ADMIN_MODULE_IDS as readonly string[]).filter(
            (id) => isAdminModuleEnabled(features, id as AdminModuleId)
        );
        const members = await prisma.tenantUser.findMany({
            where: { tenantId },
            include: {
                user: { select: { id: true, email: true } },
                tenantUserModulePermissions: {
                    select: { moduleId: true, canView: true, canEdit: true, scopeType: true, branchId: true },
                },
            },
        });
        const list = members.map((m) => {
            const perms: Record<string, { canView: boolean; canEdit: boolean; scopeType: "ALL" | "BRANCH"; branchIds: string[] }> = {};
            if (m.role === "TENANT_ADMIN") {
                const byModule = new Map<string, { canView: boolean; canEdit: boolean; scopeAll: boolean; branchIds: Set<string> }>();
                for (const p of m.tenantUserModulePermissions) {
                    const entry = byModule.get(p.moduleId);
                    const canView = p.canView || p.canEdit;
                    const canEdit = p.canEdit;
                    if (entry) {
                        entry.canView = entry.canView || canView;
                        entry.canEdit = entry.canEdit || canEdit;
                        if (p.scopeType === "ALL") entry.scopeAll = true;
                        else if (p.branchId) entry.branchIds.add(p.branchId);
                    } else {
                        byModule.set(p.moduleId, {
                            canView,
                            canEdit,
                            scopeAll: p.scopeType === "ALL",
                            branchIds: p.scopeType === "BRANCH" && p.branchId ? new Set([p.branchId]) : new Set(),
                        });
                    }
                }
                for (const [moduleId, e] of byModule) {
                    const canView = e.canView || e.canEdit;
                    const canEdit = e.canEdit;
                    perms[moduleId] = {
                        canView,
                        canEdit,
                        scopeType: e.scopeAll ? "ALL" : "BRANCH",
                        branchIds: e.scopeAll ? [] : Array.from(e.branchIds),
                    };
                }
            }
            return {
                userId: m.userId,
                email: m.user.email,
                role: m.role as "TENANT_OWNER" | "TENANT_ADMIN",
                permissions: m.role === "TENANT_ADMIN" ? perms : null,
            };
        });
        return reply.send({ members: list, enabledAdminModuleIds: enabledIds });
    });

    // POST /users — add member (owner only)
    const zAddMemberBody = z.object({
        email: z.string().email(),
        role: zTenantUserRole,
        permissions: z
            .record(z.string(), zModulePermission)
            .optional()
            .default({}),
    });
    app.post("/users", {
        schema: {
            body: zAddMemberBody,
            response: {
                201: z.object({ userId: z.string(), email: z.string(), role: zTenantUserRole }),
                400: z.object({ error: z.string(), code: z.string().optional() }),
                404: z.object({ error: z.string(), code: z.literal("USER_NOT_FOUND") }),
            },
        },
    }, async (req, reply) => {
        const tenantId = req.adminContext!.tenantId;
        const body = zAddMemberBody.parse(req.body);
        const features = req.tenant?.features as TenantFeatures | null | undefined;

        const user = await prisma.user.findUnique({ where: { email: body.email } });
        if (!user) {
            return reply.code(404).send({ error: "User not found", code: "USER_NOT_FOUND" });
        }
        const existing = await prisma.tenantUser.findUnique({
            where: { tenantId_userId: { tenantId, userId: user.id } },
        });
        if (existing) {
            return reply.code(400).send({ error: "User is already a member of this tenant", code: "ALREADY_MEMBER" });
        }

        let permissions: Record<string, NormalizedModulePermission>;
        try {
            permissions = await validateAndNormalizePermissions(prisma, tenantId, features, body.permissions ?? {});
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Invalid permissions";
            return reply.code(400).send({ error: msg, code: "INVALID_PERMISSIONS" });
        }

        await prisma.$transaction(async (tx) => {
            await tx.tenantUser.create({
                data: { tenantId, userId: user.id, role: body.role as TenantUserRole },
            });
            if (body.role === "TENANT_ADMIN" && Object.keys(permissions).length > 0) {
                for (const [moduleId, p] of Object.entries(permissions)) {
                    if (p.scopeType === "ALL") {
                        await tx.tenantUserModulePermission.create({
                            data: {
                                tenantId,
                                userId: user.id,
                                moduleId,
                                canView: p.canView,
                                canEdit: p.canEdit,
                                scopeType: "ALL",
                                branchId: null,
                            },
                        });
                    } else {
                        for (const branchId of p.branchIds) {
                            await tx.tenantUserModulePermission.create({
                                data: {
                                    tenantId,
                                    userId: user.id,
                                    moduleId,
                                    canView: p.canView,
                                    canEdit: p.canEdit,
                                    scopeType: "BRANCH",
                                    branchId,
                                },
                            });
                        }
                    }
                }
            }
        });

        return reply.code(201).send({
            userId: user.id,
            email: user.email,
            role: body.role,
        });
    });

    // PATCH /users/:userId — update role and/or permissions (owner only); enforce ≥1 owner
    const zPatchMemberBody = z.object({
        role: zTenantUserRole.optional(),
        permissions: z.record(z.string(), zModulePermission).optional(),
    });
    app.patch<{ Params: { userId: string } }>("/users/:userId", {
        schema: {
            params: z.object({ userId: z.string().uuid() }),
            body: zPatchMemberBody,
            response: {
                200: z.object({
                    userId: z.string(),
                    role: zTenantUserRole.optional(),
                    permissions: z.record(z.string(), zMemberPermission).optional(),
                }),
                400: z.object({ error: z.string(), code: z.string() }),
                404: z.object({ error: z.string(), code: z.literal("MEMBER_NOT_FOUND") }),
            },
        },
    }, async (req, reply) => {
        const tenantId = req.adminContext!.tenantId;
        const { userId: targetUserId } = req.params;
        const body = zPatchMemberBody.parse(req.body);
        const features = req.tenant?.features as TenantFeatures | null | undefined;

        const membership = await prisma.tenantUser.findUnique({
            where: { tenantId_userId: { tenantId, userId: targetUserId } },
            include: { tenantUserModulePermissions: { select: { id: true, moduleId: true, canView: true, canEdit: true, scopeType: true, branchId: true } } },
        });
        if (!membership) {
            return reply.code(404).send({ error: "Member not found", code: "MEMBER_NOT_FOUND" });
        }

        // AUDIT 7 fix 12.1: targetRole = role after this request; use it to decide whether to apply permissions.
        const targetRole = getTargetRoleForPatch(body, membership);

        // Permissions apply only to TENANT_ADMIN. If client sent permissions but targetRole is not ADMIN → 400 (no silent ignore).
        if (body.permissions !== undefined && !shouldApplyPermissionsInPatch(body, targetRole)) {
            return reply.code(400).send({
                error: "Permissions can only be set for TENANT_ADMIN; owner has full access and cannot have per-module permissions.",
                code: "INVALID_PERMISSIONS",
            });
        }

        // Validate permissions once before transaction (only when we will apply them).
        let normalizedPermissions: Record<string, NormalizedModulePermission> | undefined;
        if (shouldApplyPermissionsInPatch(body, targetRole)) {
            try {
                normalizedPermissions = await validateAndNormalizePermissions(prisma, tenantId, features, body.permissions);
            } catch (err) {
                const msg = err instanceof Error ? err.message : "Invalid permissions";
                return reply.code(400).send({ error: msg, code: "INVALID_PERMISSIONS" });
            }
        }

        // Single transaction: role update + permissions update (no intermediate state).
        const hasRoleUpdate = body.role !== undefined;
        const hasPermissionsUpdate = normalizedPermissions !== undefined;
        if (hasRoleUpdate || hasPermissionsUpdate) {
            try {
                await prisma.$transaction(async (tx) => {
                    if (hasRoleUpdate) {
                        if (membership.role === "TENANT_OWNER" && body.role === "TENANT_ADMIN") {
                            await ensureAtLeastOneOwner(tx as Parameters<typeof ensureAtLeastOneOwner>[0], tenantId, targetUserId);
                        }
                        await tx.tenantUser.update({
                            where: { tenantId_userId: { tenantId, userId: targetUserId } },
                            data: { role: body.role as TenantUserRole },
                        });
                    }
                    if (hasPermissionsUpdate && normalizedPermissions) {
                        const moduleIdsToReplace = new Set([
                            ...membership.tenantUserModulePermissions.map((r) => r.moduleId),
                            ...Object.keys(normalizedPermissions),
                        ]);
                        for (const moduleId of moduleIdsToReplace) {
                            await tx.tenantUserModulePermission.deleteMany({
                                where: { tenantId, userId: targetUserId, moduleId },
                            });
                        }
                        for (const [moduleId, p] of Object.entries(normalizedPermissions)) {
                            if (p.scopeType === "ALL") {
                                await tx.tenantUserModulePermission.create({
                                    data: {
                                        tenantId,
                                        userId: targetUserId,
                                        moduleId,
                                        canView: p.canView,
                                        canEdit: p.canEdit,
                                        scopeType: "ALL",
                                        branchId: null,
                                    },
                                });
                            } else {
                                for (const branchId of p.branchIds) {
                                    await tx.tenantUserModulePermission.create({
                                        data: {
                                            tenantId,
                                            userId: targetUserId,
                                            moduleId,
                                            canView: p.canView,
                                            canEdit: p.canEdit,
                                            scopeType: "BRANCH",
                                            branchId,
                                        },
                                    });
                                }
                            }
                        }
                    }
                });
            } catch (err) {
                const e = err as Error & { code?: string };
                if (e.code === LAST_OWNER_CODE) {
                    return reply.code(400).send({ error: e.message, code: LAST_OWNER_CODE });
                }
                throw err;
            }
        }

        const updated = await prisma.tenantUser.findUnique({
            where: { tenantId_userId: { tenantId, userId: targetUserId } },
            include: { tenantUserModulePermissions: { select: { moduleId: true, canView: true, canEdit: true, scopeType: true, branchId: true } } },
        });
        const perms: Record<string, { canView: boolean; canEdit: boolean; scopeType: "ALL" | "BRANCH"; branchIds: string[] }> = {};
        if (updated?.tenantUserModulePermissions) {
            const byModule = new Map<string, { canView: boolean; canEdit: boolean; scopeAll: boolean; branchIds: Set<string> }>();
            for (const p of updated.tenantUserModulePermissions) {
                const entry = byModule.get(p.moduleId);
                const canView = p.canView || p.canEdit;
                const canEdit = p.canEdit;
                if (entry) {
                    entry.canView = entry.canView || canView;
                    entry.canEdit = entry.canEdit || canEdit;
                    if (p.scopeType === "ALL") entry.scopeAll = true;
                    else if (p.branchId) entry.branchIds.add(p.branchId);
                } else {
                    byModule.set(p.moduleId, {
                        canView,
                        canEdit,
                        scopeAll: p.scopeType === "ALL",
                        branchIds: p.scopeType === "BRANCH" && p.branchId ? new Set([p.branchId]) : new Set(),
                    });
                }
            }
            for (const [moduleId, e] of byModule) {
                const canView = e.canView || e.canEdit;
                const canEdit = e.canEdit;
                perms[moduleId] = {
                    canView,
                    canEdit,
                    scopeType: e.scopeAll ? "ALL" : "BRANCH",
                    branchIds: e.scopeAll ? [] : Array.from(e.branchIds),
                };
            }
        }
        return reply.send({
            userId: targetUserId,
            role: updated?.role,
            permissions: Object.keys(perms).length ? perms : undefined,
        });
    });

    // DELETE /users/:userId — remove member (owner only); enforce ≥1 owner if removing owner
    app.delete<{ Params: { userId: string } }>("/users/:userId", {
        schema: {
            params: z.object({ userId: z.string().uuid() }),
            response: {
                204: z.undefined(),
                400: z.object({ error: z.string(), code: z.string() }),
                404: z.object({ error: z.string(), code: z.literal("MEMBER_NOT_FOUND") }),
            },
        },
    }, async (req, reply) => {
        const tenantId = req.adminContext!.tenantId;
        const { userId: targetUserId } = req.params;

        const membership = await prisma.tenantUser.findUnique({
            where: { tenantId_userId: { tenantId, userId: targetUserId } },
        });
        if (!membership) {
            return reply.code(404).send({ error: "Member not found", code: "MEMBER_NOT_FOUND" });
        }
        if (membership.role === "TENANT_OWNER") {
            try {
                await prisma.$transaction(async (tx) => {
                    await ensureAtLeastOneOwner(tx as Parameters<typeof ensureAtLeastOneOwner>[0], tenantId, targetUserId);
                    await tx.tenantUser.delete({
                        where: { tenantId_userId: { tenantId, userId: targetUserId } },
                    });
                });
            } catch (err) {
                const e = err as Error & { statusCode?: number; code?: string };
                if (e.code === LAST_OWNER_CODE) {
                    return reply.code(400).send({
                        error: e.message,
                        code: LAST_OWNER_CODE,
                    });
                }
                throw err;
            }
        } else {
            await prisma.tenantUser.delete({
                where: { tenantId_userId: { tenantId, userId: targetUserId } },
            });
        }
        return reply.code(204).send();
    });
};
