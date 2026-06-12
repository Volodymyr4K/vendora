/**
 * ACCESS_LEVELS Phase 2: Load tenant admin role and permissions from TenantUser.
 * Canonical source: TenantUser (role) + TenantUserModulePermission (normalized canEdit ⇒ canView).
 */

import type { PrismaClient } from "@vendora/database";

export type TenantAdminRole = "TENANT_OWNER" | "TENANT_ADMIN";

/** ACCESS_LEVELS Phase 3.5: null = all branches (scope ALL); string[] = allowed branch IDs (scope BRANCH). */
export interface ModulePermission {
    canView: boolean;
    canEdit: boolean;
    /** null = full branch scope (ALL); non-null = list of allowed branch IDs (BRANCH-scoped). */
    allowedBranchIds: string[] | null;
}

/**
 * Load membership (role) and permissions for (tenantId, userId).
 * For TENANT_ADMIN: loads TenantUserModulePermission, normalizes canEdit ⇒ canView.
 * For TENANT_OWNER: returns role only; permissions = null (full access).
 */
export async function loadTenantAdminContext(
    prisma: PrismaClient,
    tenantId: string,
    userId: string
): Promise<
    | { role: TenantAdminRole; permissions: Record<string, ModulePermission> | null }
    | null
> {
    const membership = await prisma.tenantUser.findUnique({
        where: {
            tenantId_userId: { tenantId, userId },
        },
        select: { role: true },
    });

    if (!membership) return null;

    const role = membership.role as TenantAdminRole;

    if (role === "TENANT_OWNER") {
        return { role, permissions: null };
    }

    const rows = await prisma.tenantUserModulePermission.findMany({
        where: { tenantId, userId },
        select: { moduleId: true, canView: true, canEdit: true, scopeType: true, branchId: true },
    });

    // Aggregate by moduleId: merge view/edit (OR), branch scope: ANY row with scopeType ALL → null (all branches); else union of branchIds.
    const byModule = new Map<string, { canView: boolean; canEdit: boolean; scopeAll: boolean; branchIds: Set<string> }>();
    for (const r of rows) {
        const canView = r.canView || r.canEdit;
        const canEdit = r.canEdit;
        const entry = byModule.get(r.moduleId);
        if (entry) {
            entry.canView = entry.canView || canView;
            entry.canEdit = entry.canEdit || canEdit;
            if (r.scopeType === "ALL") entry.scopeAll = true;
            else if (r.branchId) entry.branchIds.add(r.branchId);
        } else {
            byModule.set(r.moduleId, {
                canView,
                canEdit,
                scopeAll: r.scopeType === "ALL",
                branchIds: r.scopeType === "BRANCH" && r.branchId ? new Set([r.branchId]) : new Set(),
            });
        }
    }
    const permissions: Record<string, ModulePermission> = {};
    for (const [moduleId, e] of byModule) {
        permissions[moduleId] = {
            canView: e.canView,
            canEdit: e.canEdit,
            allowedBranchIds: e.scopeAll ? null : Array.from(e.branchIds),
        };
    }

    return { role, permissions };
}
