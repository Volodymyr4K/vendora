"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardStats } from "@vendora/contracts";
import { formatPrice } from "@/lib/format";
import { getDashboardStatsAction } from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { useAdminContext } from "./AdminContext";
import { AccessDeniedBlock } from "./AccessDeniedBlock";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedButton } from "@/lib/components/button-registry";

const MODULE_ID = "admin_dashboard";
const DASHBOARD_HIDDEN_TENANTS = new Set(["berlin-press"]);
const HIDDEN_DASHBOARD_REDIRECTS: Record<string, string> = {
    "berlin-press": "/admin/menu",
};

export default function AdminDashboardPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
    const router = useRouter();
    const { canEdit } = useAdminContext();
    const canEditDashboard = canEdit(MODULE_ID);
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [accessDenied, setAccessDenied] = useState(false);
    const [slug, setSlug] = useState("");
    const [tenantSlug, setTenantSlug] = useState("");
    const [redirecting, setRedirecting] = useState(false);

    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    useEffect(() => {
        params.then(p => {
            if (DASHBOARD_HIDDEN_TENANTS.has(p.tenantSlug)) {
                setRedirecting(true);
                const target = HIDDEN_DASHBOARD_REDIRECTS[p.tenantSlug] ?? "/admin";
                router.replace(`/t/${p.tenantSlug}/${p.branchSlug}${target}`);
                return;
            }
            setSlug(p.branchSlug);
            setTenantSlug(p.tenantSlug);
            load(p.branchSlug, p.tenantSlug);
        });
    }, [params, router]);

    async function load(s: string, t: string) {
        setLoading(true);
        setAccessDenied(false);
        try {
            const statsData = await getDashboardStatsAction(s, t);
            setStats(statsData);
        } catch (e) {
            if (e instanceof Error && e.message === ACCESS_DENIED_MESSAGE) {
                setAccessDenied(true);
            } else {
                console.error(e);
            }
        } finally {
            setLoading(false);
        }
    }

    if (redirecting) return null;
    if (accessDenied) return <AccessDeniedBlock />;

    return (
        <div style={{ paddingBottom: 50 }}>
            {!canEditDashboard && stats && (
                <div className="bg-warning-weak text-warning" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                    Тільки перегляд: дашборд не має кнопок зміни, лише оновлення даних.
                </div>
            )}
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
                <h2 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>Dashboard</h2>
                <Button type="button" className="btn" onClick={() => load(slug, tenantSlug)} disabled={loading} variant="primary">
                    {loading ? "Refreshing..." : "Refresh Data"}
                </Button>
            </div>

            {/* Dashboard Stats */}
            {stats ? (
                <div style={{ marginBottom: 40 }}>
                    {/* Degraded Stats Warning */}
                    {stats.meta?.isDegraded && (
                        <div className="bg-warning-weak text-warning border-warning" style={{
                            padding: 15,
                            borderRadius: 8,
                            marginBottom: 20,
                            borderWidth: "1px",
                            borderStyle: "solid"
                        }}>
                            Stats temporarily unavailable / degraded
                        </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 20, marginBottom: 20 }}>
                        <StatCard
                            label="Виручка (кухня)"
                            value={`${formatPrice(stats.revenue, true)} грн`}
                            color="text-success"
                            isBig
                        />
                        <StatCard
                            label="Доставка"
                            value={`${formatPrice(stats.deliveryRevenue, true)} грн`}
                            color="text-info"
                        />
                        <StatCard
                            label="Avg Check"
                            value={`${formatPrice(stats.avgCheck, true)} грн`}
                        />
                        <div style={{ background: "var(--paper)", padding: 20, borderRadius: 12, border: "1px solid var(--line)" }}>
                            <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 5 }}>Orders Today</div>
                            <div style={{ display: "flex", gap: 15, fontSize: "1.1rem", fontWeight: 600 }}>
                                <span className="text-success">Done: {stats.orders.done}</span>
                                <span className="text-danger">Canc: {stats.orders.cancelled}</span>
                                <span className="text-warning">Active: {stats.orders.inProgress}</span>
                            </div>
                        </div>
                    </div>

                    {/* Top Products */}
                    {stats.topProducts.length > 0 && (
                        <div style={{ background: "var(--paper)", padding: 15, borderRadius: 8 }}>
                            <div style={{ textTransform: "uppercase", fontSize: "0.75rem", color: "var(--muted)", letterSpacing: 1, marginBottom: 10 }}>
                                Top Products
                            </div>
                            <div style={{ display: "flex", gap: 20 }}>
                                {stats.topProducts.map((p, i) => (
                                    <div key={i} style={{ fontSize: "0.9rem" }}>
                                        <span style={{ fontWeight: "bold" }}>{i + 1}. {p.title}</span>
                                        <span style={{ color: "var(--muted)", marginLeft: 4 }}>x{p.count}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            ) : (
                !loading && <div style={{ color: "var(--muted)" }}>No stats available or failed to load.</div>
            )}

            {loading && !stats && <div>Loading stats...</div>}
        </div>
    );
}


function StatCard({ label, value, color = "text-ink", isBig = false }: { label: string, value: string, color?: string, isBig?: boolean }) {
    return (
        <div style={{ background: "var(--paper)", padding: 20, borderRadius: 12, border: "1px solid var(--line)" }}>
            <div style={{ color: "var(--muted)", fontSize: "0.9rem", marginBottom: 5 }}>{label}</div>
            <div className={color} style={{ fontSize: isBig ? "2rem" : "1.5rem", fontWeight: "bold" }}>{value}</div>
        </div>
    );
}
