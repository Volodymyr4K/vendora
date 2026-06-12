"use client";
import { useState } from "react";
import { rescheduleOrderAction } from "@/app/actions";
import { OrderListResponse } from "@vendora/contracts";
import { Modal } from "@/components/ui/Modal";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedButton } from "@/lib/components/button-registry";

export function RescheduleModal({
    order, branchSlug, tenantSlug, onClose, open = true
}: {
    order: OrderListResponse[number] & { requestedDeliveryTime?: string }, branchSlug: string, tenantSlug: string, onClose: () => void, open?: boolean
}) {
    // Initial value handling
    const getInitialDate = () => {
        if (order.requestedDeliveryTime) {
            // Convert ISO directly to datetime-local format (cutting off seconds/ms/Z)
            // Ideally we should respect timezone, but for simplified Admin UI local/UTC diff might occur.
            // Let's assume the user picks "Wall Clock Time".
            // The best way for datetime-local is 'YYYY-MM-DDTHH:mm'.
            return new Date(order.requestedDeliveryTime).toISOString().slice(0, 16);
        }
        return "";
    };

    const [date, setDate] = useState(getInitialDate());
    const [loading, setLoading] = useState(false);
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    async function handleSave() {
        if (!date) return;
        setLoading(true);
        try {
            // When passing to backend, we want an ISO string.
            // new Date("2026-01-16T14:30") creates a date in Local TimeZone of the browser.
            // If Admin is in Ukraine, and Server expects ISO, this works perfectly (it adds offset).
            const d = new Date(date);
            await rescheduleOrderAction(branchSlug, order.orderId, d.toISOString(), tenantSlug);
            onClose(); // Parent should trigger refresh
        } catch (e) {
            console.error(e);
            alert("Error updating order. Refresh the page if your permissions were changed.");
        } finally {
            setLoading(false);
        }
    }

    return (
        <Modal
            open={open}
            onClose={onClose}
            portal={true}
            lockScroll={true}
            closeOnEsc={true}
            closeOnBackdrop={false}
            overlayClassName="p-4"
            panelClassName="bg-paper rounded-theme shadow-theme border border-line"
            titleId="reschedule-modal-title"
        >
            <div style={{ padding: 24, width: 420 }}>
                <h3 id="reschedule-modal-title" className="text-ink" style={{ fontSize: '1.2rem', fontWeight: 'bold', marginBottom: 16 }}>Reschedule Order #{order.orderId}</h3>

                <div style={{ marginBottom: 20 }}>
                    <label className="text-muted" style={{ display: 'block', marginBottom: 8, fontSize: '0.9em' }}>New Delivery Time</label>
                    <Input
                        type="datetime-local"
                        className="w-full rounded-theme border border-line focus:outline-none focus:ring-2 focus:ring-focus-ring focus:ring-offset-2 focus:ring-offset-[var(--paper)] focus:border-line"
                        style={{ padding: "10px 12px", fontSize: '1rem' }}
                        value={date}
                        onChange={e => setDate(e.target.value)}
                    />
                </div>

                {/* WARNING ALERT */}
                <div className="bg-warning-weak text-warning border-warning rounded-theme" style={{ padding: 12, marginBottom: 24, fontSize: '0.9em', borderWidth: '1px', borderStyle: 'solid', lineHeight: 1.4 }}>
                    <div style={{ fontWeight: 'bold', marginBottom: 4 }}>⚠️ Attention!</div>
                    Changing the time does not send an automatic notification to the customer.
                    <div style={{ marginTop: 4 }}>Please <strong>call the customer to agree on the change ({order.customer.phone}).</strong></div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12 }}>
                    <Button
                        onClick={onClose}
                        disabled={loading}
                        type="button"
                        variant="outline"
                        className="bg-paper rounded-theme border border-line"
                        style={{ padding: "8px 16px", cursor: "pointer" }}
                    >Cancel</Button>
                    <Button
                        onClick={handleSave}
                        disabled={loading}
                        type="button"
                        variant="primary"
                        className="bg-ink text-paper border border-line hover:opacity-90 disabled:opacity-50 rounded-theme"
                        style={{ padding: "8px 16px", cursor: "pointer", opacity: loading ? 0.7 : 1 }}
                    >
                        {loading ? "Saving..." : "Save Changes"}
                    </Button>
                </div>
            </div>
        </Modal>
    );
}
