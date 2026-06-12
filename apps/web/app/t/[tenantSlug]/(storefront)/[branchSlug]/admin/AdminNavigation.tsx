"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { AdminMeResponse } from "@/lib/data";
import { OWNER_ONLY_ADMIN_MODULE_IDS, type AdminModuleId } from "@vendora/contracts";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

/** Phase 6.3: Single source for Super Admin panel path (app/super-admin/page.tsx). */
const SUPER_ADMIN_ROUTE = "/super-admin";

/** ACCESS_LEVELS Phase 6.1: menu items with moduleId for permission filtering. Owner-only from OWNER_ONLY_ADMIN_MODULE_IDS (contracts). */
const MENU_ITEMS: { path: string; label: string; moduleId: string }[] = [
    { path: "", label: "Dashboard", moduleId: "admin_dashboard" },
    { path: "/orders", label: "Orders", moduleId: "admin_orders" },
    { path: "/menu", label: "Menu", moduleId: "admin_catalog_menu" },
    { path: "/content", label: "Content", moduleId: "admin_content" },
    { path: "/journal", label: "Journal", moduleId: "admin_content" },
    { path: "/settings", label: "Settings", moduleId: "admin_settings" },
    { path: "/users", label: "Users", moduleId: "admin_users" },
];
const HIDDEN_MODULES_BY_TENANT = new Map<string, Set<AdminModuleId>>([
    ["berlin-press", new Set<AdminModuleId>(["admin_dashboard", "admin_orders", "admin_settings", "admin_users"])],
]);
const LABEL_OVERRIDES_BY_TENANT = new Map<string, Partial<Record<AdminModuleId, string>>>([
    ["berlin-press", { admin_catalog_menu: "Catalog" }],
]);

function canViewModule(ctx: AdminMeResponse | null, item: { moduleId: string }): boolean {
    if (!ctx) return false;
    if (!ctx.enabledAdminModuleIds.includes(item.moduleId as AdminModuleId)) return false;
    if (OWNER_ONLY_ADMIN_MODULE_IDS.includes(item.moduleId as AdminModuleId)) return ctx.role === "TENANT_OWNER";
    if (ctx.role === "TENANT_OWNER") return true;
    return ctx.permissions?.[item.moduleId as AdminModuleId]?.canView === true;
}

export function AdminNavigation({
    branchSlug,
    tenantSlug,
    adminContext,
}: {
    branchSlug: string;
    tenantSlug: string;
    adminContext: AdminMeResponse | null;
}) {
    const pathname = usePathname();
    const root = `/t/${tenantSlug}/${branchSlug}`;
    const adminRoot = `${root}/admin`;

    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    const linkStyle = (active: boolean) => ({
        fontWeight: active ? 800 : 400,
        color: active ? "var(--ink)" : "var(--muted)",
        padding: "8px 12px",
        borderRadius: 6,
        background: active ? "var(--line)" : "transparent",
        display: "block",
        textDecoration: "none"
    });

    const hiddenModules = HIDDEN_MODULES_BY_TENANT.get(tenantSlug);
    const visibleItems = MENU_ITEMS.filter((item) => {
        if (hiddenModules?.has(item.moduleId as AdminModuleId)) return false;
        return canViewModule(adminContext, item);
    });
    const labelOverrides = LABEL_OVERRIDES_BY_TENANT.get(tenantSlug);

    return (
        <nav style={{ display: "flex", flexDirection: "column", gap: 5 }}>
            {adminContext === null ? (
                <span style={{ padding: "8px 12px", color: "var(--muted)", fontSize: "0.9em" }}>No access</span>
            ) : null}
            {adminContext?.isSuperAdmin === true && (
                <div className="bg-info-weak text-info" style={{ padding: "8px 12px", marginBottom: 8, borderRadius: 6, fontSize: "0.85em", lineHeight: 1.4 }}>
                    You are also a platform admin. To manage modules for this tenant, use the <Link href={SUPER_ADMIN_ROUTE} className="text-info" style={{ fontWeight: 600 }}>Super Admin</Link> panel.
                </div>
            )}
            {visibleItems.map((item) => {
                const href = `${adminRoot}${item.path}`;
                const isActive = item.path === "" ? pathname === href : (pathname === href || pathname.startsWith(`${href}/`));
                return (
                    <Link key={href} href={href} style={linkStyle(isActive)}>
                        {labelOverrides?.[item.moduleId as AdminModuleId] ?? item.label}
                    </Link>
                );
            })}
            <hr style={{ margin: "10px 0" }} />
            <Link href={`${root}`} style={{ padding: "8px 12px", color: "var(--muted)" }}>
                Back to Site
            </Link>
            <Button
                type="button"
                onClick={() => import("@/app/actions").then(m => m.logoutAction(branchSlug))}
                variant="ghost"
                className="text-danger"
                style={{ padding: "8px 12px", background: "none", border: "none", textAlign: "left", cursor: "pointer", fontSize: "inherit" }}
            >
                Logout
            </Button>
        </nav>
    );
}
