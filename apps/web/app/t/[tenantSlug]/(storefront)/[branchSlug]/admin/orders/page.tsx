"use client";

import { useEffect, useState, useTransition } from "react";
import { getAdminOrdersAction, updateOrderStatusAction } from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { AccessDeniedBlock } from "../AccessDeniedBlock"; // Assuming these actions are exported
import { OrderListResponse } from "@vendora/contracts";
import { formatPrice } from "@/lib/format";
import { RescheduleModal } from "@/components/admin/RescheduleModal";
import { useAdminContext } from "../AdminContext";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedSelect } from "@/lib/components/select-registry";
import { getThemedButton } from "@/lib/components/button-registry";

const MODULE_ID = "admin_orders";

const STATUS_OPTIONS = ["created", "pending", "paid", "confirmed", "cancelled", "done"];

const STATUS_CONFIG: Record<string, { bg: string; text: string }> = {
    created: { bg: "var(--bg)", text: "var(--ink)" },
    pending: { bg: "var(--color-warning-weak)", text: "var(--color-warning)" },
    paid: { bg: "var(--color-success-weak)", text: "var(--color-success)" },
    confirmed: { bg: "var(--color-info-weak)", text: "var(--color-info)" },
    done: { bg: "var(--color-success-weak)", text: "var(--color-success)" },
    cancelled: { bg: "var(--color-danger-weak)", text: "var(--color-danger)" },
    default: { bg: "var(--bg)", text: "var(--ink)" }
};

const WRITE_ERROR_HINT = " Refresh the page if your permissions were changed.";

function StatusSelect({ order, branchSlug, tenantSlug, onStatusChange, onError, readOnly }: { order: OrderListResponse[number], branchSlug: string, tenantSlug: string, onStatusChange: () => void; onError?: (message: string) => void; readOnly?: boolean }) {
    const [isPending, startTransition] = useTransition();
    const [status, setStatus] = useState(order.status);
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Select = getThemedSelect({ componentSet, tenantOverrideKey: tenantSlug });

    useEffect(() => {
        setStatus(order.status);
    }, [order.status]);

    const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newStatus = e.target.value;
        setStatus(newStatus as OrderListResponse[number]["status"]); // Optimistic

        startTransition(async () => {
            try {
                await updateOrderStatusAction(branchSlug, order.orderId, newStatus, tenantSlug);
                onStatusChange(); // Trigger parent refresh
            } catch (err) {
                setStatus(order.status); // Revert optimistic update
                onError?.(String(err) + WRITE_ERROR_HINT);
            }
        });
    };

    const config = STATUS_CONFIG[status] ?? STATUS_CONFIG['default'] ?? { bg: "var(--bg)", text: "var(--ink)" };

    if (readOnly) {
        return (
            <span
                style={{
                    padding: "4px 8px",
                    borderRadius: 4,
                    fontSize: "0.85em",
                    fontWeight: 800,
                    background: config.bg,
                    color: config.text,
                }}
            >
                {status.toUpperCase()}
            </span>
        );
    }

    return (
        <Select
            value={status}
            onChange={handleChange}
            disabled={isPending}
            style={{
                padding: "4px 8px",
                borderRadius: 4,
                fontSize: "0.85em",
                fontWeight: 800,
                background: config.bg,
                color: config.text,
                border: "1px solid transparent",
                opacity: isPending ? 0.5 : 1,
                cursor: "pointer"
            }}
            options={STATUS_OPTIONS.map(s => ({
                value: s,
                label: s.toUpperCase()
            }))}
        />
    );
}

export default function AdminOrdersPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
    const { canEdit } = useAdminContext();
    const canEditOrders = canEdit(MODULE_ID);
    const [orders, setOrders] = useState<OrderListResponse>([]);
    const [loading, setLoading] = useState(true);
    const [slug, setSlug] = useState("");
    const [tenantSlug, setTenantSlug] = useState("");
    const [editingOrder, setEditingOrder] = useState<OrderListResponse[number] | null>(null);
    const [orderError, setOrderError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);

    useEffect(() => {
        params.then(p => {
            setSlug(p.branchSlug);
            setTenantSlug(p.tenantSlug);
            load(p.branchSlug, p.tenantSlug);
        });
    }, [params]);

    async function load(s: string, ts: string) {
        setLoading(true);
        setAccessDenied(false);
        try {
            const ordersData = await getAdminOrdersAction(s, ts);
            setOrders(ordersData);
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

    const handleStatusChange = () => {
        load(slug, tenantSlug);
    };

    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    if (accessDenied) return <AccessDeniedBlock />;

    return (
        <div style={{ paddingBottom: 50 }}>
            {!canEditOrders && (
                <div className="bg-warning-weak text-warning" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                    Read-only: you can view orders but not change status or reschedule.
                </div>
            )}
            {orderError && (
                <div className="bg-danger-weak text-danger" style={{ padding: "10px 14px", borderRadius: 8, marginBottom: 20, fontSize: 14 }}>
                    {orderError}
                    <Button type="button" onClick={() => setOrderError(null)} variant="outline" className="" style={{ marginLeft: 12, fontSize: 12 }}>Dismiss</Button>
                </div>
            )}
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 30 }}>
                <h2 style={{ fontSize: "1.8rem", fontWeight: "bold" }}>Orders</h2>
                <Button type="button" onClick={() => load(slug, tenantSlug)} disabled={loading} variant="primary" className="btn">
                    {loading ? "Refreshing..." : "Refresh"}
                </Button>
            </div>

            <table style={{ width: "100%", borderCollapse: "collapse" }} suppressHydrationWarning>
                <thead suppressHydrationWarning>
                    <tr style={{ textAlign: "left", borderBottom: "2px solid var(--line)" }} suppressHydrationWarning>
                        <th style={{ padding: 10 }}>ID</th>
                        <th style={{ padding: 10 }}>Time</th>
                        <th style={{ padding: 10 }}>Scheduled</th>
                        <th style={{ padding: 10 }}>Customer</th>
                        <th style={{ padding: 10 }}>Status</th>
                        <th style={{ padding: 10, textAlign: "right" }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {orders.map((o) => (
                        <tr key={o.token} style={{ borderBottom: "1px solid var(--line)" }} suppressHydrationWarning>
                            <td style={{ padding: 10, fontFamily: "monospace" }}>{o.orderId}</td>
                            <td style={{ padding: 10 }} suppressHydrationWarning>
                                {new Date(o.createdAt).toLocaleString('uk-UA', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                    day: '2-digit',
                                    month: '2-digit'
                                })}

                            </td>
                            <td style={{ padding: 10 }}>
                                {(o as OrderListResponse[number] & { requestedDeliveryTime?: string }).requestedDeliveryTime ? (
                                    canEditOrders ? (
                                        <div
                                            onClick={() => setEditingOrder(o)}
                                            className="bg-success-weak text-success"
                                            style={{ padding: '2px 6px', borderRadius: 4, display: 'inline-block', fontSize: '0.9em', fontWeight: 'bold', cursor: 'pointer' }}
                                            title="Click to reschedule"
                                        >
                                            {new Date((o as OrderListResponse[number] & { requestedDeliveryTime?: string }).requestedDeliveryTime!).toLocaleString('uk-UA', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                day: 'numeric',
                                                month: 'short'
                                            })}
                                        </div>
                                    ) : (
                                        <span style={{ fontSize: '0.9em' }}>
                                            {new Date((o as OrderListResponse[number] & { requestedDeliveryTime?: string }).requestedDeliveryTime!).toLocaleString('uk-UA', {
                                                hour: '2-digit',
                                                minute: '2-digit',
                                                day: 'numeric',
                                                month: 'short'
                                            })}
                                        </span>
                                    )
                                ) : (
                                    canEditOrders ? (
                                        <Button
                                            type="button"
                                            onClick={() => setEditingOrder(o)}
                                            variant="ghost"
                                            className=""
                                            style={{ background: 'none', border: 'none', color: 'var(--muted)', cursor: 'pointer', fontSize: '0.8em', textDecoration: 'underline' }}
                                        >
                                            ASAP (Edit)
                                        </Button>
                                    ) : (
                                        <span style={{ fontSize: '0.8em', color: 'var(--muted)' }}>ASAP</span>
                                    )
                                )}
                            </td>
                            <td style={{ padding: 10 }}>
                                <div>{o.customer.name || "Guest"}</div>
                                <div className="muted" style={{ fontSize: "0.85em" }}>{o.customer.phone}</div>
                            </td>
                            <td style={{ padding: 10 }}>
                                <StatusSelect
                                    order={o}
                                    branchSlug={slug}
                                    tenantSlug={tenantSlug}
                                    onStatusChange={() => { setOrderError(null); handleStatusChange(); }}
                                    onError={setOrderError}
                                    readOnly={!canEditOrders}
                                />
                            </td>
                            <td style={{ padding: 10, textAlign: "right", fontWeight: 800 }}>
                                {formatPrice(o.total, true)} UAH
                            </td>
                        </tr>
                    ))}
                    {!loading && orders.length === 0 && (
                        <tr>
                            <td colSpan={5} style={{ padding: 20, textAlign: "center", color: "var(--muted)" }}>No orders found</td>
                        </tr>
                    )}
                </tbody>
            </table>

            {editingOrder && (
                <RescheduleModal
                    order={editingOrder}
                    branchSlug={slug}
                    tenantSlug={tenantSlug}
                    onClose={() => { setEditingOrder(null); load(slug, tenantSlug); }}
                />
            )}
        </div>
    );
}
