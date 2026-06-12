"use client";

import { createContext, useContext, useMemo } from "react";
import type { AdminMeResponse } from "@/lib/data";
import { OWNER_ONLY_ADMIN_MODULE_IDS, type AdminModuleId } from "@vendora/contracts";

/** ACCESS_LEVELS Phase 6.2: can edit = owner (full access) or admin with canEdit on module. Owner-only modules only for TENANT_OWNER. */
export function canEditModule(ctx: AdminMeResponse | null, moduleId: AdminModuleId): boolean {
    if (!ctx) return false;
    if (!ctx.enabledAdminModuleIds.includes(moduleId)) return false;
    if (OWNER_ONLY_ADMIN_MODULE_IDS.includes(moduleId)) return ctx.role === "TENANT_OWNER";
    if (ctx.role === "TENANT_OWNER") return true;
    return ctx.permissions?.[moduleId]?.canEdit === true;
}

export function canViewModule(ctx: AdminMeResponse | null, moduleId: AdminModuleId): boolean {
    if (!ctx) return false;
    if (!ctx.enabledAdminModuleIds.includes(moduleId)) return false;
    if (OWNER_ONLY_ADMIN_MODULE_IDS.includes(moduleId)) return ctx.role === "TENANT_OWNER";
    if (ctx.role === "TENANT_OWNER") return true;
    return ctx.permissions?.[moduleId]?.canView === true;
}

const AdminContext = createContext<AdminMeResponse | null>(null);

export function AdminContextProvider({
    adminContext,
    children,
}: {
    adminContext: AdminMeResponse | null;
    children: React.ReactNode;
}) {
    const value = adminContext;
    return <AdminContext.Provider value={value}>{children}</AdminContext.Provider>;
}

export function useAdminContext(): {
    adminContext: AdminMeResponse | null;
    canEdit: (moduleId: AdminModuleId) => boolean;
    canView: (moduleId: AdminModuleId) => boolean;
} {
    const adminContext = useContext(AdminContext);
    const canEdit = useMemo(
        () => (moduleId: AdminModuleId) => canEditModule(adminContext, moduleId),
        [adminContext]
    );
    const canView = useMemo(
        () => (moduleId: AdminModuleId) => canViewModule(adminContext, moduleId),
        [adminContext]
    );
    return { adminContext, canEdit, canView };
}
