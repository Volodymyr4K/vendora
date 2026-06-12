import { getBranchConfigAction, getAdminMeAction } from "@/app/actions";
import { notFound } from "next/navigation";
import { AdminNavigation } from "./AdminNavigation";
import { AdminContextProvider } from "./AdminContext";

export default async function AdminLayout({
    children,
    params,
}: {
    children: React.ReactNode;
    params: Promise<{ tenantSlug: string; branchSlug: string }>;
}) {
    // We trust params.tenantSlug as source of truth for this route path
    const { tenantSlug, branchSlug } = await params;
    // Pass explicit tenantSlug to override any missing middleware header in Dev/Direct access
    const cfg = await getBranchConfigAction(branchSlug, tenantSlug);
    if (!cfg) return notFound();

    // ACCESS_LEVELS Phase 6.1: admin context for menu (role, permissions, enabled modules)
    const adminContext = await getAdminMeAction(tenantSlug);

    return (
        <AdminContextProvider adminContext={adminContext}>
            <div className="admin-layout" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 20, minHeight: "80vh" }}>
                <aside style={{ background: "var(--paper)", padding: 20, borderRadius: 8 }} suppressHydrationWarning>
                    <h3 style={{ marginBottom: 20 }}>Admin</h3>
                    <AdminNavigation branchSlug={branchSlug} tenantSlug={tenantSlug} adminContext={adminContext} />
                </aside>
                <main>
                    <div className="card" style={{ height: "100%" }}>
                        {children}
                    </div>
                </main>
            </div>
        </AdminContextProvider>
    );
}
