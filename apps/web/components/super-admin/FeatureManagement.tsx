"use client";

import { useState } from "react";
import { Switch } from "@/components/ui/Switch";
import { updateTenantAction } from "@/app/actions";
import type { TenantFeatures } from "@vendora/contracts";
import { ADMIN_MODULE_IDS, type AdminModuleId } from "@vendora/contracts";

interface FeatureManagementProps {
    tenant: {
        id: string;
        name: string;
        slug: string;
        features?: TenantFeatures | null;
    };
}

export function FeatureManagement({ tenant }: FeatureManagementProps) {
    const [features, setFeatures] = useState<TenantFeatures["modules"]>({
        // Master switches
        profile: tenant.features?.modules?.profile ?? true,
        ordering: tenant.features?.modules?.ordering ?? true,
        delivery: tenant.features?.modules?.delivery ?? true,
        menu: tenant.features?.modules?.menu ?? true,

        // Granular features (Phase 8)
        customerProfiles: tenant.features?.modules?.customerProfiles ?? true,
        orderHistory: tenant.features?.modules?.orderHistory ?? true,
        savedAddresses: tenant.features?.modules?.savedAddresses ?? true,
        favorites: tenant.features?.modules?.favorites ?? true,

        cartCheckout: tenant.features?.modules?.cartCheckout ?? true,
        scheduledOrdering: tenant.features?.modules?.scheduledOrdering ?? true,
        quickReorder: tenant.features?.modules?.quickReorder ?? true,

        basicDelivery: tenant.features?.modules?.basicDelivery ?? true,
    });

    // ACCESS_LEVELS Phase 4.1: Admin modules (Gate №1 per tenant)
    const [adminModules, setAdminModules] = useState<Record<string, boolean>>(() => {
        const current = tenant.features?.adminModules ?? {};
        const out: Record<string, boolean> = {};
        for (const id of ADMIN_MODULE_IDS) {
            out[id] = current[id] === true;
        }
        return out;
    });

    // PHASE 11: Track version for optimistic locking
    const [version, setVersion] = useState<number>(tenant.features?.version || 1);
    const [saving, setSaving] = useState(false);
    const [message, setMessage] = useState<{ type: "success" | "error" | "warning"; text: string } | null>(null);

    /**
     * PHASE 11: Smart Retry with Backoff
     * Only retries on 5xx/network errors, NOT on 4xx client errors
     */
    /**
     * PHASE 11: Smart Retry with Backoff
     * Only retries on 5xx/network errors, NOT on 4xx client errors
     */
    const retryWithBackoff = async <T,>(fn: () => Promise<T>, retries = 3): Promise<T> => {
        for (let i = 0; i < retries; i++) {
            try {
                return await fn();
            } catch (error: unknown) {
                // Check if this is an HTTP error with status code
                const status = (error as { status?: number; response?: { status?: number } })?.status ||
                    (error as { response?: { status?: number } })?.response?.status;

                // DO NOT retry on client errors (4xx) - they won't succeed on retry
                if (status && status >= 400 && status < 500) {
                    throw error; // 409 Conflict, 400 Bad Request, etc.
                }

                // Retry on server errors (5xx) or network errors
                if (i === retries - 1) {
                    throw error; // Last attempt failed
                }

                // Exponential backoff: 1s, 2s, 4s
                await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, i)));
            }
        }
        throw new Error("Retry failed"); // Should never reach here
    };

    const handleSave = async () => {
        setSaving(true);
        setMessage(null);

        try {
            // PHASE 11: Use smart retry
            await retryWithBackoff(async () => {
                const response = await updateTenantAction(tenant.id, {
                    features: {
                        version, // Send current version for optimistic locking
                        modules: features,
                        adminModules,
                    },
                }, [tenant.slug]);

                // Check for error in response (fetchWithAuth might return error object)
                if (response && typeof response === 'object' && 'error' in response) {
                    const error = new Error((response as { error: string }).error) as Error & { status?: number };
                    error.status = 409; // Assume conflict if error in response
                    throw error;
                }

                return response;
            });

            // Success - increment local version to match server
            setVersion(v => v + 1);
            setMessage({ type: "success", text: "✓ Features saved successfully!" });
        } catch (error: unknown) {
            console.error("Failed to save features:", error);

            // PHASE 11: Smart error handling based on error type
            // Strict cast for analysis
            const errAny = error as { status?: number; message?: string };
            if (errAny.status === 409 || errAny.message?.includes("Conflict")) {
                setMessage({
                    type: "warning",
                    text: "⚠ Conflict: Features were updated by another user. Please refresh the page."
                });
            } else {
                setMessage({
                    type: "error",
                    text: "⚠ Failed to save after 3 retries. Please check your connection."
                });
            }
        } finally {
            setSaving(false);
        }
    };

    // Master Switch logic: toggle all child features
    const toggleMasterSwitch = (category: "profile" | "ordering" | "delivery", enabled: boolean) => {
        const updates: Partial<typeof features> = { [category]: enabled };

        if (category === "profile") {
            updates.customerProfiles = enabled;
            updates.orderHistory = enabled;
            updates.savedAddresses = enabled;
            updates.favorites = enabled;
        } else if (category === "ordering") {
            updates.cartCheckout = enabled;
            updates.scheduledOrdering = enabled;
            updates.quickReorder = enabled;
        } else if (category === "delivery") {
            updates.basicDelivery = enabled;
        }

        setFeatures({ ...features, ...updates });
    };

    // ACCESS_LEVELS Phase 4.1: Human-readable labels for admin modules
    const adminModuleLabels: Record<AdminModuleId, string> = {
        admin_dashboard: "Dashboard",
        admin_orders: "Orders",
        admin_users: "Users (members & permissions)",
        admin_catalog_products: "Catalog: Products",
        admin_catalog_categories: "Catalog: Categories",
        admin_catalog_menu: "Catalog: Menu",
        admin_catalog_nutrition: "Catalog: Nutrition",
        admin_catalog_allergens: "Catalog: Allergens",
        admin_catalog_option_groups: "Catalog: Option groups",
        admin_catalog_offers: "Catalog: Offers",
        admin_catalog_attribute_definitions: "Catalog: Attribute definitions",
        admin_catalog_attribute_values: "Catalog: Attribute values",
        admin_integrations: "Integrations",
        admin_delivery_config: "Delivery config",
        admin_settings: "Settings",
        admin_media: "Media upload",
        admin_content: "Content",
    };

    return (
        <div className="space-y-6">
            {/* Success/Error/Warning Message */}
            {message && (
                <div className={`p-4 rounded-theme ${message.type === "success"
                    ? "bg-green-50 text-green-800 border border-green-200"
                    : message.type === "warning"
                        ? "bg-yellow-50 text-yellow-800 border border-yellow-200"
                        : "bg-red-50 text-red-800 border border-red-200"
                    }`}>
                    {message.text}
                </div>
            )}

            {/* ACCESS_LEVELS Phase 4.1: Two blocks — Public and Admin (plan: "Public modules" and "Admin modules") */}
            <h2 className="text-lg font-semibold text-ink">Public modules</h2>
            <p className="text-sm text-muted mb-4">Storefront modules for customers (menu, profile, orders, delivery).</p>
            {/* Profile & Account Category */}
            <div className="bg-paper rounded-theme shadow-theme p-6 border border-line">
                <div className="border-b border-line pb-4 mb-4">
                    <Switch
                        checked={features.profile}
                        onChange={(checked) => toggleMasterSwitch("profile", checked)}
                        label="🧑 Profile & Account"
                        className="text-lg font-bold"
                    />
                    <p className="text-sm text-muted mt-2 ml-10">
                        Master switch: enables/disables all profile-related features
                    </p>
                </div>

                <div className="space-y-3 ml-10">
                    <Switch
                        checked={features.customerProfiles}
                        onChange={(checked) => setFeatures({ ...features, customerProfiles: checked })}
                        label="Customer Profiles"
                        description="Allow users to edit personal information"
                        disabled={!features.profile}
                        className={!features.profile ? "opacity-50" : ""}
                    />
                    <Switch
                        checked={features.orderHistory}
                        onChange={(checked) => setFeatures({ ...features, orderHistory: checked })}
                        label="Order History"
                        description="Show past orders and track status"
                        disabled={!features.profile}
                        className={!features.profile ? "opacity-50" : ""}
                    />
                    <Switch
                        checked={features.savedAddresses}
                        onChange={(checked) => setFeatures({ ...features, savedAddresses: checked })}
                        label="Saved Addresses"
                        description="Manage delivery addresses"
                        disabled={!features.profile}
                        className={!features.profile ? "opacity-50" : ""}
                    />
                    <Switch
                        checked={features.favorites}
                        onChange={(checked) => setFeatures({ ...features, favorites: checked })}
                        label="Favorites / Wishlist"
                        description="Save favorite items for later"
                        disabled={!features.profile}
                        className={!features.profile ? "opacity-50" : ""}
                    />
                </div>
            </div>

            {/* Ordering Category */}
            <div className="bg-paper rounded-theme shadow-theme p-6 border border-line">
                <div className="border-b border-line pb-4 mb-4">
                    <Switch
                        checked={features.ordering}
                        onChange={(checked) => toggleMasterSwitch("ordering", checked)}
                        label="🛒 Ordering"
                        className="text-lg font-bold"
                    />
                    <p className="text-sm text-muted mt-2 ml-10">
                        Master switch: enables/disables all ordering features
                    </p>
                </div>

                <div className="space-y-3 ml-10">
                    <Switch
                        checked={features.cartCheckout}
                        onChange={(checked) => setFeatures({ ...features, cartCheckout: checked })}
                        label="Cart & Checkout"
                        description="Basic cart and checkout functionality"
                        disabled={!features.ordering}
                        className={!features.ordering ? "opacity-50" : ""}
                    />
                    <Switch
                        checked={features.scheduledOrdering}
                        onChange={(checked) => setFeatures({ ...features, scheduledOrdering: checked })}
                        label="Scheduled Ordering"
                        description="Time slot selection for delivery"
                        disabled={!features.ordering}
                        className={!features.ordering ? "opacity-50" : ""}
                    />
                    <Switch
                        checked={features.quickReorder}
                        onChange={(checked) => setFeatures({ ...features, quickReorder: checked })}
                        label="Quick Re-order"
                        description="Repeat previous order"
                        disabled={!features.ordering}
                        className={!features.ordering ? "opacity-50" : ""}
                    />
                </div>
            </div>

            {/* Delivery Category */}
            <div className="bg-paper rounded-theme shadow-theme p-6 border border-line">
                <div className="border-b border-line pb-4 mb-4">
                    <Switch
                        checked={features.delivery}
                        onChange={(checked) => toggleMasterSwitch("delivery", checked)}
                        label="🚚 Delivery"
                        className="text-lg font-bold"
                    />
                    <p className="text-sm text-muted mt-2 ml-10">
                        Master switch: enables/disables delivery features
                    </p>
                </div>

                <div className="space-y-3 ml-10">
                    <Switch
                        checked={features.basicDelivery}
                        onChange={(checked) => setFeatures({ ...features, basicDelivery: checked })}
                        label="Basic Delivery"
                        description="Delivery zones, fees, and ETA"
                        disabled={!features.delivery}
                        className={!features.delivery ? "opacity-50" : ""}
                    />
                </div>
            </div>

            {/* Menu / Catalog — standalone (e.g. café without delivery still has menu) */}
            <div className="bg-paper rounded-theme shadow-theme p-6 border border-line">
                <Switch
                    checked={features.menu}
                    onChange={(checked) => setFeatures({ ...features, menu: checked })}
                    label="📋 Menu / Catalog"
                    description="Show menu to customers (can be on even when delivery is off)"
                    className="text-lg font-bold"
                />
            </div>

            {/* ACCESS_LEVELS Phase 4.1: Admin modules block */}
            <h2 className="text-lg font-semibold text-ink mt-8">Admin modules</h2>
            <p className="text-sm text-muted mb-4">
                Brand admin panel modules. A disabled module is unavailable even to the brand owner (Gate #1). Validated against the canonical list (contracts).
            </p>
            <div className="bg-paper rounded-theme shadow-theme p-6 border border-line">
                <div className="grid gap-3 sm:grid-cols-2">
                    {ADMIN_MODULE_IDS.map((id) => (
                        <Switch
                            key={id}
                            checked={adminModules[id] ?? false}
                            onChange={(checked) => setAdminModules((prev) => ({ ...prev, [id]: checked }))}
                            label={adminModuleLabels[id]}
                            className="font-medium"
                        />
                    ))}
                </div>
            </div>

            {/* Save Button */}
            <div className="flex justify-end gap-4">
                <button
                    onClick={() => window.history.back()}
                    className="px-6 py-3 bg-[var(--line)] text-ink rounded-theme hover:bg-[var(--muted)] transition-colors font-semibold"
                    disabled={saving}
                >
                    Cancel
                </button>
                <button
                    onClick={handleSave}
                    className="px-6 py-3 bg-blue-600 text-white rounded-theme hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    disabled={saving}
                >
                    {saving ? "Saving..." : "Save Changes"}
                </button>
            </div>
        </div>
    );
}
