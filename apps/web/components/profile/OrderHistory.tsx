"use client";

import { RepeatButton } from "@/components/profile/RepeatButton";


interface Order {
    id: string;
    orderId: string;
    total: number;
    status: string;
    createdAt: string;
    itemsSummary: string;
}

export function OrderHistory({ orders, tenantSlug }: { orders: Order[], tenantSlug: string }) {
    if (orders.length === 0) {
        return <div className="text-center py-10 text-muted">You haven't placed any orders yet.</div>;
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'done': return 'bg-[var(--bg)] text-ink border border-line';
            case 'cancelled': return 'bg-danger-weak text-danger';
            case 'pending': return 'bg-warning-weak text-warning';
            case 'confirmed': return 'bg-info-weak text-info';
            default: return 'bg-paper text-muted border border-line';
        }
    };

    return (
        <div className="space-y-4">
            {orders.map(order => (
                <div key={order.id} className="bg-paper border border-line rounded-theme p-4 flex justify-between items-center shadow-theme">
                    <div>
                        <div className="flex items-center gap-3">
                            <span className="font-mono font-bold text-ink">#{order.orderId}</span>
                            <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wide ${getStatusColor(order.status)}`}>
                                {order.status}
                            </span>
                        </div>
                        <div className="text-sm text-muted mt-1">
                            {new Date(order.createdAt).toLocaleDateString()} at {new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-sm text-ink mt-2 font-medium">
                            {order.itemsSummary}
                        </div>
                    </div>
                    <div className="text-lg font-bold text-ink text-right">
                        {(order.total / 100).toFixed(2)} <span className="text-sm font-normal text-muted">UAH</span>
                        <div className="mt-2 flex justify-end">
                            <RepeatButton orderId={order.orderId} tenantSlug={tenantSlug} />
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );
}
