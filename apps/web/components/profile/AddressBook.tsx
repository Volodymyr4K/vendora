"use client";

import { useState } from "react";
import { addCustomerAddressAction, deleteCustomerAddressAction } from "@/app/customer-actions";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedInput } from "@/lib/components/input-registry";
import { getThemedButton } from "@/lib/components/button-registry";

interface Address {
    id: string;
    city: string;
    street: string;
    house: string;
    flat?: string;
    label?: string;
}

interface AddressBookProps {
    initialAddresses: Address[];
    tenantSlug: string;
}

export function AddressBook({ initialAddresses, tenantSlug }: AddressBookProps) {
    const theme = useThemeOptional();
    const componentSet = theme?.componentSet ?? "default";
    const Input = getThemedInput({ componentSet, tenantOverrideKey: tenantSlug });
    const Button = getThemedButton({ componentSet, tenantOverrideKey: tenantSlug });

    const [addresses, setAddresses] = useState(initialAddresses);
    const [showForm, setShowForm] = useState(false);

    // New Address State
    const [city, setCity] = useState("");
    const [street, setStreet] = useState("");
    const [house, setHouse] = useState("");
    const [flat, setFlat] = useState("");
    const [label, setLabel] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleAdd = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        try {
            const newAddr = await addCustomerAddressAction({
                city, street, house, flat, label
            }, tenantSlug);
            setAddresses([newAddr, ...addresses]);
            setShowForm(false);
            // Reset
            setCity(""); setStreet(""); setHouse(""); setFlat(""); setLabel("");
        } catch (e: unknown) {
            // Check for Limit Error
            try {
                const msg = e instanceof Error ? e.message : String(e);
                const json = JSON.parse(msg);
                setError(json.message || "Failed to add address");
            } catch {
                const msg = e instanceof Error ? e.message : "Failed to add address";
                setError(msg);
            }
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("Delete this address?")) return;
        try {
            await deleteCustomerAddressAction(id, tenantSlug);
            setAddresses(addresses.filter(a => a.id !== id));
        } catch (e) {
            alert("Failed to delete");
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium text-ink">My Addresses ({addresses.length}/5)</h3>
                {!showForm && addresses.length < 5 && (
                    <Button
                        onClick={() => setShowForm(true)}
                        variant="ghost"
                        className="text-sm text-[var(--accent)] font-semibold hover:opacity-80"
                    >
                        + Add New
                    </Button>
                )}
            </div>

            {/* ERROR BANNER */}
            {error && (
                <div className="p-3 bg-danger-weak border-l-4 border-danger text-danger text-sm">
                    {error}
                </div>
            )}

            {showForm && (
                <form onSubmit={handleAdd} className="bg-paper p-4 rounded-theme border border-line animate-in fade-in slide-in-from-top-2">
                    <div className="grid grid-cols-2 gap-3 mb-3">
                        <Input value={city} onChange={e => setCity(e.target.value)} placeholder="City" required className="p-2 border border-line rounded-theme" />
                        <Input value={street} onChange={e => setStreet(e.target.value)} placeholder="Street" required className="p-2 border border-line rounded-theme" />
                    </div>
                    <div className="grid grid-cols-3 gap-3 mb-3">
                        <Input value={house} onChange={e => setHouse(e.target.value)} placeholder="House" required className="p-2 border border-line rounded-theme" />
                        <Input value={flat} onChange={e => setFlat(e.target.value)} placeholder="Flat" className="p-2 border border-line rounded-theme" />
                        <Input value={label} onChange={e => setLabel(e.target.value)} placeholder="Label (Home)" className="p-2 border border-line rounded-theme" />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" onClick={() => setShowForm(false)} variant="outline" className="px-3 py-1 text-muted">Cancel</Button>
                        <Button type="submit" disabled={loading} variant="primary" className="px-3 py-1 disabled:opacity-50">
                            {loading ? "Saving..." : "Save Address"}
                        </Button>
                    </div>
                </form>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
                {addresses.map(addr => (
                    <div key={addr.id} className="relative p-4 bg-paper border border-line rounded-theme shadow-theme hover:border-[var(--muted)]">
                        <div className="font-semibold text-ink">{addr.label || "Address"}</div>
                        <div className="text-muted mt-1">{addr.city}, {addr.street} {addr.house}</div>
                        {addr.flat && <div className="text-muted text-sm">Apt/Office: {addr.flat}</div>}

                        <Button
                            onClick={() => handleDelete(addr.id)}
                            variant="ghost"
                            className="absolute top-4 right-4 text-danger opacity-60 hover:opacity-100 text-sm"
                        >
                            Delete
                        </Button>
                    </div>
                ))}
                {addresses.length === 0 && !showForm && (
                    <div className="col-span-2 text-center py-8 text-muted text-sm">
                        No saved addresses.
                    </div>
                )}
            </div>
        </div>
    );
}
