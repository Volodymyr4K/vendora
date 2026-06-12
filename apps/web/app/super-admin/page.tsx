"use client";

import { useEffect, useState } from "react";
import {
    getSuperTenantsAction,
    createTenantAction,
    updateTenantAction, // New
    toggleTenantAction,
    deleteTenantAction,
    getTenantBranchesAction,
    createBranchAction,
    updateTenantThemeAction,
    updateTenantMainTemplateAction
} from "@/app/actions";
import { Select } from "@/components/ui/Select";
import { Switch } from "@/components/ui/Switch";
import { getCountryFlag } from "@/lib/country-helpers";
import { logger } from "@/lib/logger"; // Added logger
import type { TenantFeatures, TenantFeaturesUpdate } from "@vendora/contracts";
import { MAIN_TEMPLATE_IDS } from "@vendora/contracts";

// Tenant Interface
interface Tenant {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    countryCode: string;
    currency: string;
    timezone: string;
    features?: TenantFeatures; // NEW: Feature flags
    mainTemplate?: string;
    createdAt: string;
    branchCount?: number;
}

// Create Tenant Form Data
interface CreateTenantForm {
    name: string;
    slug: string;
    countryCode: string;
    currency: string;
    timezone: string; // NEW
    adminEmail: string;
    adminPassword: string;
}

// Edit Tenant Form Data
interface EditTenantForm {
    name: string;
    slug: string;
    countryCode: string;
    currency: string;
    timezone: string;
    features?: TenantFeaturesUpdate; // NEW: Feature flags
}

// Branch Interface
interface Branch {
    id: string;
    slug: string;
    cityName: string;
    address: string | null;
    phones: string[];
    isActive: boolean;
    deliveryFee: number;
    freeFrom: number;
    etaMin: number;
    etaMax: number;
    createdAt: string;
}

// Create Branch Form Data
interface CreateBranchForm {
    name: string;
    slug: string;
    cityName: string;
    address: string;
    phone: string;
}

export default function SuperAdminPage() {
    const [tenants, setTenants] = useState<Tenant[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [showModal, setShowModal] = useState(false);
    const [formData, setFormData] = useState<CreateTenantForm>({
        name: "",
        slug: "",
        countryCode: "UA",
        currency: "UAH",
        timezone: "Europe/Kiev", // NEW
        adminEmail: "",
        adminPassword: "",
    });
    const [formError, setFormError] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Edit State
    const [showEditModal, setShowEditModal] = useState(false);
    const [editingTenant, setEditingTenant] = useState<Tenant | null>(null);
    const [editFormData, setEditFormData] = useState<EditTenantForm>({
        name: "",
        slug: "",
        countryCode: "UA",
        currency: "UAH",
        timezone: "Europe/Kiev", // NEW
    });
    const [editFormError, setEditFormError] = useState<string | null>(null);
    const [submittingEdit, setSubmittingEdit] = useState(false);
    const [themeJson, setThemeJson] = useState<string>('{"version":1,"preset":"default","tokens":{},"brand":{}}');
    const [themeError, setThemeError] = useState<string | null>(null);
    const [submittingTheme, setSubmittingTheme] = useState(false);
    const [mainTemplate, setMainTemplate] = useState<string>("default");
    const [mainTemplateError, setMainTemplateError] = useState<string | null>(null);
    const [submittingMainTemplate, setSubmittingMainTemplate] = useState(false);

    // Extracted for testability: Theme save handler logic
    async function handleSaveTheme() {
        if (submittingTheme) return;
        setThemeError(null);
        setSubmittingTheme(true);
        try {
            const parsed = JSON.parse(themeJson);
            if (!editingTenant) return;
            const slugs = [editingTenant.slug, editFormData.slug].filter(Boolean);
            await updateTenantThemeAction(editingTenant.id, slugs, parsed);
            setThemeError(null);
        } catch (e) {
            if (e instanceof SyntaxError) {
                setThemeError("Invalid JSON");
            } else {
                setThemeError((e as Error).message || "Failed to save theme");
            }
        } finally {
            setSubmittingTheme(false);
        }
    }

    async function handleSaveMainTemplate() {
        if (submittingMainTemplate || !editingTenant) return;
        setMainTemplateError(null);
        setSubmittingMainTemplate(true);
        try {
            const res = await updateTenantMainTemplateAction(editingTenant.id, mainTemplate);
            setMainTemplate(res.mainTemplate);
            setEditingTenant({ ...editingTenant, mainTemplate: res.mainTemplate });
            if (selectedTenant && selectedTenant.id === editingTenant.id) {
                setSelectedTenant({ ...selectedTenant, mainTemplate: res.mainTemplate });
            }
            setTenants((prev) =>
                prev.map((t) => (t.id === editingTenant.id ? { ...t, mainTemplate: res.mainTemplate } : t))
            );
            setMainTemplateError(null);
            void loadTenants();
        } catch (e) {
            setMainTemplateError((e as Error).message || "Failed to save main template");
        } finally {
            setSubmittingMainTemplate(false);
        }
    }

    // Search and filter state
    const [searchTenant, setSearchTenant] = useState("");
    const [sortBy, setSortBy] = useState<"name" | "branches">("name");
    const [searchBranch, setSearchBranch] = useState("");

    // Branch management state
    const [showBranchesModal, setShowBranchesModal] = useState(false);
    const [selectedTenant, setSelectedTenant] = useState<Tenant | null>(null);
    const [branches, setBranches] = useState<Branch[]>([]);
    const [loadingBranches, setLoadingBranches] = useState(false);
    const [showAddBranchForm, setShowAddBranchForm] = useState(false);
    const [branchFormData, setBranchFormData] = useState<CreateBranchForm>({
        name: "",
        slug: "",
        cityName: "",
        address: "",
        phone: "",
    });
    const [branchFormError, setBranchFormError] = useState<string | null>(null);
    const [submittingBranch, setSubmittingBranch] = useState(false);

    useEffect(() => {
        loadTenants();
    }, []);

    async function loadTenants() {
        setLoading(true);
        setError(null);
        try {
            const data = await getSuperTenantsAction();
            // Map DTO to UI Model (handling nulls)
            const mapped: Tenant[] = data.map(t => ({
                ...t,
                countryCode: t.countryCode || "UA",
                currency: t.currency || "UAH",
                timezone: t.timezone || "Europe/Kiev",
                // Ensure createdAt is string (DTO says string, runtime is string)
                createdAt: t.createdAt as string
            }));
            setTenants(mapped);
        } catch (e) {
            setError((e as Error).message);
            // setError((e as Error).message); // duplicate removed
            logger.error("Load Tenants Error", e);
        } finally {
            setLoading(false);
        }
    }

    async function toggleTenant(id: string, tenantSlug: string, currentStatus: boolean) {
        try {
            await toggleTenantAction(id, tenantSlug);

            // Optimistically update UI
            setTenants((prev) =>
                prev.map((t) =>
                    t.id === id ? { ...t, isActive: !currentStatus } : t
                )
            );
        } catch (e) {
            console.error(e);
            alert((e as Error).message);
            // Re-fetch to ensure consistency
            loadTenants();
        }
    }

    async function deleteTenant(id: string, name: string) {
        const confirmed = window.confirm(
            `Are you sure you want to delete "${name}"?\n\nThis will permanently delete:\n- All branches\n- All products\n- All orders\n- All users\n- All categories\n\nThis action CANNOT be undone!`
        );

        if (!confirmed) return;

        try {
            await deleteTenantAction(id);

            // Remove from UI
            setTenants((prev) => prev.filter((t) => t.id !== id));
        } catch (e) {
            console.error(e);
            alert((e as Error).message);
        }
    }

    async function handleCreateTenant(e: React.FormEvent) {
        e.preventDefault();
        setFormError(null);
        setSubmitting(true);

        try {
            await createTenantAction(formData);

            // Success! Close modal and refresh list
            setShowModal(false);
            setFormData({
                name: "",
                slug: "",
                countryCode: "UA",
                currency: "UAH",
                timezone: "Europe/Kiev", // NEW
                adminEmail: "",
                adminPassword: ""
            });
            loadTenants();
        } catch (e) {
            setFormError((e as Error).message);
        } finally {
            setSubmitting(false);
        }
    }

    // async function openBranchesModal(tenant: Tenant) {
    //     setSelectedTenant(tenant);
    //     setShowBranchesModal(true);
    //     setShowAddBranchForm(false);
    //     setSearchBranch(""); // Reset branch search
    //     loadBranches(tenant.id);
    // }

    // Filter and sort tenants
    const filteredTenants = tenants
        .filter(t =>
            t.name.toLowerCase().includes(searchTenant.toLowerCase()) ||
            t.slug.toLowerCase().includes(searchTenant.toLowerCase())
        );

    // Note: Branch count sorting would require fetching branch counts from API
    // For now, just sort by name
    const sortedTenants = [...filteredTenants].sort((a, b) => {
        return a.name.localeCompare(b.name);
    });

    // Filter branches
    const filteredBranches = branches.filter(b =>
        b.cityName.toLowerCase().includes(searchBranch.toLowerCase()) ||
        b.slug.toLowerCase().includes(searchBranch.toLowerCase())
    );

    async function loadBranches(tenantId: string) {
        setLoadingBranches(true);
        try {
            const data = await getTenantBranchesAction(tenantId);
            setBranches(data);
        } catch (e) {
            console.error(e);
            alert((e as Error).message);
        } finally {
            setLoadingBranches(false);
        }
    }

    async function handleCreateBranch(e: React.FormEvent) {
        e.preventDefault();
        if (!selectedTenant) return;

        setBranchFormError(null);
        setSubmittingBranch(true);

        try {
            await createBranchAction(selectedTenant.id, branchFormData, selectedTenant.slug);

            // Success! Close form and refresh branches
            setShowAddBranchForm(false);
            setBranchFormData({ name: "", slug: "", cityName: "", address: "", phone: "" });
            loadBranches(selectedTenant.id);
        } catch (e) {
            setBranchFormError((e as Error).message);
        } finally {
            setSubmittingBranch(false);
        }
    }

    // PRE-FILL LOGIC: User requirement (Important!)
    function handleEditClick(tenant: Tenant) {
        // DEBUG: Log what we're receiving
        logger.debug('🔍 Edit Tenant Data:', {
            countryCode: tenant.countryCode,
            currency: tenant.currency,
            types: {
                countryCode: typeof tenant.countryCode,
                currency: typeof tenant.currency
            }
        });

        setEditingTenant(tenant);
        setEditFormData({
            name: tenant.name,
            slug: tenant.slug,
            // FIX: Normalize to uppercase to match option values
            countryCode: (tenant.countryCode || "UA").toUpperCase(),
            currency: (tenant.currency || "UAH").toUpperCase(),
            timezone: tenant.timezone || "Europe/Kiev", // NEW
            // DEFENSIVE: Default to true if features are missing (prevent accidental disable)
            features: {
                modules: {
                    profile: tenant.features?.modules?.profile ?? true,
                    ordering: tenant.features?.modules?.ordering ?? true,
                    delivery: tenant.features?.modules?.delivery ?? true,
                    menu: tenant.features?.modules?.menu ?? true,
                }
            }
        });
        setEditFormError(null);
        setThemeJson('{"version":1,"preset":"default","tokens":{},"brand":{}}');
        setThemeError(null);
        setSubmittingTheme(false);
        setMainTemplate(tenant.mainTemplate ?? "default");
        setMainTemplateError(null);
        setSubmittingMainTemplate(false);
        setShowEditModal(true);
    }

    async function handleUpdateTenant(e: React.FormEvent) {
        e.preventDefault();
        if (!editingTenant) return;

        setEditFormError(null);
        setSubmittingEdit(true);

        try {
            const slugs = [editingTenant.slug, editFormData.slug].filter(Boolean);
            await updateTenantAction(editingTenant.id, editFormData, slugs);

            // Success
            setShowEditModal(false);
            setEditingTenant(null);
            loadTenants(); // Refresh list to show new data
        } catch (e) {
            setEditFormError((e as Error).message);
        } finally {
            setSubmittingEdit(false);
        }
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
            <div className="max-w-screen-2xl w-full mx-auto">
                {/* Header */}
                <div className="flex justify-between items-center mb-8">
                    <div>
                        <h1 className="text-4xl font-bold text-gray-900">
                            Super Admin: Tenant Control
                        </h1>
                        <p className="text-gray-600 mt-2">
                            Manage restaurant tenants and their status
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => setShowModal(true)}
                            className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold shadow-md"
                        >
                            + Create Tenant
                        </button>
                        <button
                            onClick={loadTenants}
                            disabled={loading}
                            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow-md"
                        >
                            {loading ? "Refreshing..." : "Refresh"}
                        </button>
                    </div>
                </div>

                {/* Search and Sort Bar */}
                <div className="mb-6 flex gap-3">
                    <input
                        type="text"
                        placeholder="Search tenants by name or slug..."
                        value={searchTenant}
                        onChange={(e) => setSearchTenant(e.target.value)}
                        className="flex-1 px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                    <select
                        value={sortBy}
                        onChange={(e) => setSortBy(e.target.value as "name" | "branches")}
                        className="px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 bg-white font-semibold"
                    >
                        <option value="name">Sort by Name</option>
                        <option value="branches">Sort by Branches</option>
                    </select>
                </div>

                {/* Error State */}
                {error && (
                    <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                        <p className="text-red-800 font-semibold">Error: {error}</p>
                    </div>
                )}

                {/* Loading State */}
                {loading && !error && (
                    <div className="flex justify-center items-center py-20">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                    </div>
                )}

                {/* Tenants Table */}
                {!loading && !error && (
                    <div className="bg-white rounded-xl shadow-lg overflow-x-auto overflow-y-hidden border border-gray-200">
                        <table className="w-full">
                            <thead className="bg-gradient-to-r from-gray-800 to-gray-700 text-white">
                                <tr>
                                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                                        Name
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                                        Slug
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                                        Created At
                                    </th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold uppercase tracking-wider">
                                        Status
                                    </th>
                                    <th className="px-6 py-4 text-center text-sm font-semibold uppercase tracking-wider">
                                        Actions
                                    </th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {sortedTenants.length === 0 ? (
                                    <tr>
                                        <td
                                            colSpan={5}
                                            className="px-6 py-12 text-center text-gray-500"
                                        >
                                            {searchTenant ? "No tenants match your search" : "No tenants found"}
                                        </td>
                                    </tr>
                                ) : (
                                    sortedTenants.map((tenant) => (
                                        <tr
                                            key={tenant.id}
                                            className="hover:bg-gray-50 transition-colors"
                                        >
                                            {/* Name */}
                                            <td className="px-6 py-4">
                                                <div className="text-sm font-semibold text-gray-900">
                                                    {tenant.name}
                                                </div>
                                            </td>

                                            {/* Slug */}
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-700 font-mono bg-gray-100 px-2 py-1 rounded inline-block">
                                                    {tenant.slug}
                                                </div>
                                            </td>

                                            {/* Created At */}
                                            <td className="px-6 py-4">
                                                <div className="text-sm text-gray-600">
                                                    {new Date(tenant.createdAt).toLocaleDateString(
                                                        "en-US",
                                                        {
                                                            year: "numeric",
                                                            month: "short",
                                                            day: "numeric",
                                                        }
                                                    )}
                                                </div>
                                                <div className="mt-1 flex gap-2">
                                                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200">
                                                        {getCountryFlag(tenant.countryCode)} {tenant.countryCode}
                                                    </span>
                                                    <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded border border-gray-200 font-mono">
                                                        {tenant.currency}
                                                    </span>
                                                </div>
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-6 py-4">
                                                <div className="flex items-center gap-2">
                                                    {tenant.isActive ? (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800 border border-green-300">
                                                            <span className="w-2 h-2 bg-green-500 rounded-full mr-2"></span>
                                                            Active
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800 border border-red-300">
                                                            <span className="w-2 h-2 bg-red-500 rounded-full mr-2"></span>
                                                            Inactive
                                                        </span>
                                                    )}
                                                    {tenant.branchCount !== undefined && tenant.branchCount > 0 && (
                                                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold bg-blue-100 text-blue-800">
                                                            🏢 {tenant.branchCount}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Actions */}
                                            <td className="px-6 py-4">
                                                <div className="flex flex-wrap justify-end gap-2">
                                                    <button
                                                        onClick={() =>
                                                            toggleTenant(tenant.id, tenant.slug, tenant.isActive)
                                                        }
                                                        className={`px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md ${tenant.isActive
                                                            ? "bg-orange-600 text-white hover:bg-orange-700"
                                                            : "bg-green-600 text-white hover:bg-green-700"
                                                            }`}
                                                    >
                                                        {tenant.isActive ? "Deactivate" : "Activate"}
                                                    </button>
                                                    <a
                                                        href={`/super-admin/tenants/${tenant.id}/branches`}
                                                        target="_blank"
                                                        rel="noopener noreferrer"
                                                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-blue-600 text-white hover:bg-blue-700 inline-block text-center whitespace-nowrap"
                                                        title="Manage Branches (Opens in new tab)"
                                                    >
                                                        🏢 Branches
                                                    </a>
                                                    <a
                                                        href={`/super-admin/tenants/${tenant.id}/domains`}
                                                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-purple-600 text-white hover:bg-purple-700 inline-block whitespace-nowrap"
                                                        title="Manage Custom Domains"
                                                    >
                                                        🌐 Domains
                                                    </a>
                                                    <a
                                                        href={`/super-admin/tenants/${tenant.id}/features`}
                                                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-emerald-600 text-white hover:bg-emerald-700 inline-block whitespace-nowrap"
                                                        title="Manage Features"
                                                    >
                                                        🎛️ Features
                                                    </a>
                                                    <a
                                                        href={`/super-admin/tenants/${tenant.id}/payment-providers`}
                                                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-slate-900 text-white hover:bg-black inline-block whitespace-nowrap"
                                                        title="Manage Payment Providers"
                                                    >
                                                        💳 Payments
                                                    </a>
                                                    <button
                                                        onClick={() => deleteTenant(tenant.id, tenant.name)}
                                                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-red-600 text-white hover:bg-red-700 whitespace-nowrap"
                                                        title="Delete Tenant"
                                                    >
                                                        🗑️ Delete
                                                    </button>
                                                    <button
                                                        onClick={() => handleEditClick(tenant)}
                                                        className="px-4 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-gray-800 text-white hover:bg-gray-900 whitespace-nowrap"
                                                        title="Edit Details"
                                                    >
                                                        ✏️ Edit
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                )
                }

                {/* Stats Footer */}
                {
                    !loading && !error && tenants.length > 0 && (
                        <div className="mt-6 flex justify-between items-center text-sm text-gray-600">
                            <div>
                                Total Tenants: <span className="font-semibold">{tenants.length}</span>
                            </div>
                            <div className="flex gap-6">
                                <div>
                                    Active:{" "}
                                    <span className="font-semibold text-green-700">
                                        {tenants.filter((t) => t.isActive).length}
                                    </span>
                                </div>
                                <div>
                                    Inactive:{" "}
                                    <span className="font-semibold text-red-700">
                                        {tenants.filter((t) => !t.isActive).length}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )
                }
            </div >

            {/* Create Tenant Modal */}
            {
                showModal && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                            <h2 className="text-2xl font-bold text-gray-900 mb-4">
                                Create New Tenant
                            </h2>

                            {formError && (
                                <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                    <p className="text-red-800 text-sm">{formError}</p>
                                </div>
                            )}

                            <form onSubmit={handleCreateTenant}>
                                <div className="space-y-4">
                                    {/* Name */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                                            Restaurant Name
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.name}
                                            onChange={(e) =>
                                                setFormData({ ...formData, name: e.target.value })
                                            }
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="e.g., Pizza Palace"
                                            required
                                        />
                                    </div>

                                    {/* Slug */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                                            Slug (URL-friendly)
                                        </label>
                                        <input
                                            type="text"
                                            value={formData.slug}
                                            onChange={(e) =>
                                                setFormData({ ...formData, slug: e.target.value.toLowerCase() })
                                            }
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                            placeholder="e.g., pizza-palace"
                                            pattern="[a-z0-9-]+"
                                            required
                                        />
                                        <p className="text-xs text-gray-500 mt-1">
                                            Only lowercase letters, numbers, and hyphens
                                        </p>
                                    </div>

                                    {/* Regional Config (Luxury Selects) */}
                                    <div className="grid grid-cols-3 gap-4">
                                        <Select
                                            label="Country"
                                            value={formData.countryCode}
                                            onChange={(e) => setFormData({ ...formData, countryCode: e.target.value })}
                                            options={[
                                                { value: "UA", label: "🇺🇦 Ukraine" },
                                                { value: "DE", label: "🇩🇪 Germany" },
                                                { value: "PL", label: "🇵🇱 Poland" },
                                                { value: "US", label: "🇺🇸 USA" },
                                            ]}
                                        />
                                        <Select
                                            label="Currency"
                                            value={formData.currency}
                                            onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
                                            options={[
                                                { value: "UAH", label: "₴ UAH" },
                                                { value: "EUR", label: "€ EUR" },
                                                { value: "PLN", label: "zł PLN" },
                                                { value: "USD", label: "$ USD" },
                                            ]}
                                        />
                                        <Select
                                            label="Timezone"
                                            value={formData.timezone}
                                            onChange={(e) => setFormData({ ...formData, timezone: e.target.value })}
                                            options={[
                                                { value: "Europe/Kiev", label: "🇺🇦 Kyiv (UTC+2, DST +3)" },
                                                { value: "Europe/Berlin", label: "🇩🇪 Berlin (UTC+1, DST +2)" },
                                                { value: "Europe/Warsaw", label: "🇵🇱 Warsaw (UTC+1, DST +2)" },
                                                { value: "America/New_York", label: "🇺🇸 New York (UTC-5, DST -4)" },
                                                { value: "America/Chicago", label: "🇺🇸 Chicago (UTC-6, DST -5)" },
                                                { value: "America/Los_Angeles", label: "🇺🇸 Los Angeles (UTC-8, DST -7)" },
                                                { value: "Europe/London", label: "🇬🇧 London (UTC+0, DST +1)" },
                                            ]}
                                        />
                                    </div>

                                    {/* Admin Email */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                                            Admin Email
                                        </label>
                                        <input
                                            type="email"
                                            value={formData.adminEmail}
                                            onChange={(e) =>
                                                setFormData({ ...formData, adminEmail: e.target.value })
                                            }
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="admin@example.com"
                                            required
                                        />
                                    </div>

                                    {/* Admin Password */}
                                    <div>
                                        <label className="block text-sm font-semibold text-gray-700 mb-1">
                                            Admin Password
                                        </label>
                                        <input
                                            type="password"
                                            value={formData.adminPassword}
                                            onChange={(e) =>
                                                setFormData({ ...formData, adminPassword: e.target.value })
                                            }
                                            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                            placeholder="Min. 6 characters"
                                            minLength={6}
                                            required
                                        />
                                    </div>
                                </div>

                                {/* Buttons */}
                                <div className="flex gap-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setShowModal(false);
                                            setFormError(null);
                                            setFormData({
                                                name: "",
                                                slug: "",
                                                countryCode: "UA",
                                                currency: "UAH",
                                                timezone: "Europe/Kiev",
                                                adminEmail: "",
                                                adminPassword: ""
                                            });
                                        }}
                                        className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                        disabled={submitting}
                                    >
                                        {submitting ? "Creating..." : "Create Tenant"}
                                    </button>
                                </div>
                            </form>
                        </div >
                    </div >
                )
            }

            {/* Edit Tenant Modal */}
            {showEditModal && editingTenant && (
                <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
                        <h2 className="text-2xl font-bold text-gray-900 mb-4">
                            Edit Tenant
                        </h2>

                        {editFormError && (
                            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg">
                                <p className="text-red-800 text-sm">{editFormError}</p>
                            </div>
                        )}

                        <form onSubmit={handleUpdateTenant}>
                            <div className="space-y-4">
                                {/* Name */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Restaurant Name
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.name}
                                        onChange={(e) =>
                                            setEditFormData({ ...editFormData, name: e.target.value })
                                        }
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                        required
                                    />
                                </div>

                                {/* Slug */}
                                <div>
                                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                                        Slug (URL-friendly)
                                    </label>
                                    <input
                                        type="text"
                                        value={editFormData.slug}
                                        onChange={(e) =>
                                            setEditFormData({ ...editFormData, slug: e.target.value.toLowerCase() })
                                        }
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono"
                                        pattern="[a-z0-9-]+"
                                        required
                                    />
                                </div>

                                {/* Regional Config */}
                                <div className="grid grid-cols-3 gap-4">
                                    <Select
                                        label="Country"
                                        value={editFormData.countryCode}
                                        onChange={(e) => setEditFormData({ ...editFormData, countryCode: e.target.value })}
                                        options={[
                                            { value: "UA", label: "🇺🇦 Ukraine" },
                                            { value: "DE", label: "🇩🇪 Germany" },
                                            { value: "PL", label: "🇵🇱 Poland" },
                                            { value: "US", label: "🇺🇸 USA" },
                                        ]}
                                    />
                                    <Select
                                        label="Currency"
                                        value={editFormData.currency}
                                        onChange={(e) => setEditFormData({ ...editFormData, currency: e.target.value })}
                                        options={[
                                            { value: "UAH", label: "₴ UAH" },
                                            { value: "EUR", label: "€ EUR" },
                                            { value: "PLN", label: "zł PLN" },
                                            { value: "USD", label: "$ USD" },
                                        ]}
                                    />
                                    <Select
                                        label="Timezone"
                                        value={editFormData.timezone}
                                        onChange={(e) => setEditFormData({ ...editFormData, timezone: e.target.value })}
                                        options={[
                                            { value: "Europe/Kiev", label: "🇺🇦 Kyiv (UTC+2, DST +3)" },
                                            { value: "Europe/Berlin", label: "🇩🇪 Berlin (UTC+1, DST +2)" },
                                            { value: "Europe/Warsaw", label: "🇵🇱 Warsaw (UTC+1, DST +2)" },
                                            { value: "America/New_York", label: "🇺🇸 New York (UTC-5, DST -4)" },
                                            { value: "America/Chicago", label: "🇺🇸 Chicago (UTC-6, DST -5)" },
                                            { value: "America/Los_Angeles", label: "🇺🇸 Los Angeles (UTC-8, DST -7)" },
                                            { value: "Europe/London", label: "🇬🇧 London (UTC+0, DST +1)" },
                                        ]}
                                    />
                                </div>
                            </div>

                            {/* Feature Modules */}
                            <div className="space-y-3 pt-6 border-t border-gray-200">
                                <h3 className="text-base font-bold text-gray-900 mb-2">
                                    🎛️ Feature Modules
                                </h3>
                                <p className="text-sm text-gray-500 mb-4">
                                    Control which features are available for this tenant
                                </p>

                                <Switch
                                    checked={editFormData.features?.modules?.profile ?? true}
                                    onChange={(checked) => setEditFormData({
                                        ...editFormData,
                                        features: {
                                            ...editFormData.features,
                                            modules: {
                                                profile: checked,
                                                ordering: editFormData.features?.modules?.ordering ?? true,
                                                delivery: editFormData.features?.modules?.delivery ?? true,
                                                menu: editFormData.features?.modules?.menu ?? true,
                                            }
                                        }
                                    })}
                                    label="🧑 Personal Cabinet (Profile, Orders, Addresses, Favorites)"
                                    className="py-2"
                                />

                                <Switch
                                    checked={editFormData.features?.modules?.ordering ?? true}
                                    onChange={(checked) => setEditFormData({
                                        ...editFormData,
                                        features: {
                                            ...editFormData.features,
                                            modules: {
                                                ordering: checked,
                                                profile: editFormData.features?.modules?.profile ?? true,
                                                delivery: editFormData.features?.modules?.delivery ?? true,
                                                menu: editFormData.features?.modules?.menu ?? true,
                                            }
                                        }
                                    })}
                                    label="🛒 Ordering System (Cart, Checkout, Payment)"
                                    className="py-2"
                                />

                                <Switch
                                    checked={editFormData.features?.modules?.delivery ?? true}
                                    onChange={(checked) => setEditFormData({
                                        ...editFormData,
                                        features: {
                                            ...editFormData.features,
                                            modules: {
                                                delivery: checked,
                                                profile: editFormData.features?.modules?.profile ?? true,
                                                ordering: editFormData.features?.modules?.ordering ?? true,
                                                menu: editFormData.features?.modules?.menu ?? true,
                                            }
                                        }
                                    })}
                                    label="🚚 Delivery Management (Future: Real-time tracking)"
                                    className="py-2"
                                />

                                <Switch
                                    checked={editFormData.features?.modules?.menu ?? true}
                                    onChange={(checked) => setEditFormData({
                                        ...editFormData,
                                        features: {
                                            ...editFormData.features,
                                            modules: {
                                                menu: checked,
                                                profile: editFormData.features?.modules?.profile ?? true,
                                                ordering: editFormData.features?.modules?.ordering ?? true,
                                                delivery: editFormData.features?.modules?.delivery ?? true,
                                            }
                                        }
                                    })}
                                    label="📋 Menu / Catalog (can be on without delivery)"
                                    className="py-2"
                                />
                            </div>

                            {/* Main Template Section */}
                            <div className="space-y-3 pt-6 border-t border-gray-200">
                                <h3 className="text-base font-bold text-gray-900 mb-2">
                                    🧩 Main Template
                                </h3>
                                <Select
                                    label="Template"
                                    value={mainTemplate}
                                    onChange={(e) => setMainTemplate(e.target.value)}
                                    options={MAIN_TEMPLATE_IDS.map((id) => ({ value: id, label: id }))}
                                    error={mainTemplateError || undefined}
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveMainTemplate}
                                    disabled={submittingMainTemplate || !editingTenant}
                                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submittingMainTemplate ? "Saving..." : "Save Main Template"}
                                </button>
                            </div>

                            {/* Theme Section */}
                            <div className="space-y-3 pt-6 border-t border-gray-200">
                                <h3 className="text-base font-bold text-gray-900 mb-2">
                                    🎨 Theme (ThemeV1 JSON)
                                </h3>
                                <div>
                                    <textarea
                                        value={themeJson}
                                        onChange={(e) => setThemeJson(e.target.value)}
                                        disabled={submittingTheme}
                                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                        rows={6}
                                    />
                                    {themeError && (
                                        <div className="mt-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <p className="text-red-800 text-sm">{themeError}</p>
                                        </div>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={handleSaveTheme}
                                    disabled={submittingTheme || !editingTenant}
                                    className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    {submittingTheme ? "Saving..." : "Save Theme"}
                                </button>
                            </div>

                            {/* Buttons */}
                            <div className="flex gap-3 mt-6">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowEditModal(false);
                                        setEditFormError(null);
                                        setEditingTenant(null);
                                        setMainTemplateError(null);
                                    }}
                                    className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold"
                                    disabled={submittingEdit}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                                    disabled={submittingEdit}
                                >
                                    {submittingEdit ? "Saving..." : "Save Changes"}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Branches Modal */}
            {
                showBranchesModal && selectedTenant && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full p-6 max-h-[90vh] overflow-y-auto">
                            <div className="flex justify-between items-center mb-4">
                                <h2 className="text-2xl font-bold text-gray-900">
                                    Branches for {selectedTenant.name}
                                </h2>
                                <button
                                    onClick={() => {
                                        setShowBranchesModal(false);
                                        setSelectedTenant(null);
                                        setShowAddBranchForm(false);
                                    }}
                                    className="text-gray-500 hover:text-gray-700 text-2xl"
                                >
                                    ×
                                </button>
                            </div>

                            {/* Add Branch Button */}
                            {!showAddBranchForm && (
                                <div className="flex gap-3 mb-4">
                                    <button
                                        onClick={() => setShowAddBranchForm(true)}
                                        className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold"
                                    >
                                        + Add Branch
                                    </button>
                                    <input
                                        type="text"
                                        placeholder="Search branches..."
                                        value={searchBranch}
                                        onChange={(e) => setSearchBranch(e.target.value)}
                                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                                    />
                                </div>
                            )}

                            {/* Add Branch Form */}
                            {showAddBranchForm && (
                                <div className="mb-6 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                    <h3 className="text-lg font-bold text-gray-900 mb-3">Create New Branch</h3>

                                    {branchFormError && (
                                        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                                            <p className="text-red-800 text-sm">{branchFormError}</p>
                                        </div>
                                    )}

                                    <form onSubmit={handleCreateBranch}>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {/* Name */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                    Branch Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={branchFormData.name}
                                                    onChange={(e) =>
                                                        setBranchFormData({ ...branchFormData, name: e.target.value })
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                    placeholder="e.g., Downtown Location"
                                                    required
                                                />
                                            </div>

                                            {/* Slug */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                    Slug
                                                </label>
                                                <input
                                                    type="text"
                                                    value={branchFormData.slug}
                                                    onChange={(e) =>
                                                        setBranchFormData({ ...branchFormData, slug: e.target.value.toLowerCase() })
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm"
                                                    placeholder="e.g., downtown"
                                                    pattern="[a-z0-9-]+"
                                                    required
                                                />
                                            </div>

                                            {/* City Name */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                    City Name
                                                </label>
                                                <input
                                                    type="text"
                                                    value={branchFormData.cityName}
                                                    onChange={(e) =>
                                                        setBranchFormData({ ...branchFormData, cityName: e.target.value })
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                    placeholder="e.g., Kyiv"
                                                    required
                                                />
                                            </div>

                                            {/* Phone */}
                                            <div>
                                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                    Phone
                                                </label>
                                                <input
                                                    type="tel"
                                                    value={branchFormData.phone}
                                                    onChange={(e) =>
                                                        setBranchFormData({ ...branchFormData, phone: e.target.value })
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                    placeholder="+380501234567"
                                                />
                                            </div>

                                            {/* Address (full width) */}
                                            <div className="md:col-span-2">
                                                <label className="block text-sm font-semibold text-gray-700 mb-1">
                                                    Address
                                                </label>
                                                <input
                                                    type="text"
                                                    value={branchFormData.address}
                                                    onChange={(e) =>
                                                        setBranchFormData({ ...branchFormData, address: e.target.value })
                                                    }
                                                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                                    placeholder="123 Main St, Downtown"
                                                />
                                            </div>
                                        </div>

                                        {/* Form Buttons */}
                                        <div className="flex gap-3 mt-4">
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    setShowAddBranchForm(false);
                                                    setBranchFormError(null);
                                                    setBranchFormData({ name: "", slug: "", cityName: "", address: "", phone: "" });
                                                }}
                                                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors font-semibold text-sm"
                                                disabled={submittingBranch}
                                            >
                                                Cancel
                                            </button>
                                            <button
                                                type="submit"
                                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                                                disabled={submittingBranch}
                                            >
                                                {submittingBranch ? "Creating..." : "Create Branch"}
                                            </button>
                                        </div>
                                    </form>
                                </div>
                            )}

                            {/* Branches List */}
                            {loadingBranches ? (
                                <div className="flex justify-center py-8">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                                </div>
                            ) : filteredBranches.length === 0 ? (
                                <div className="text-center py-8 text-gray-500">
                                    {searchBranch ? "No branches match your search" : "No branches yet. Click 'Add Branch' to create one."}
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {filteredBranches.map((branch) => (
                                        <div
                                            key={branch.id}
                                            className="p-4 bg-gray-50 rounded-lg border border-gray-200 hover:border-blue-300 transition-colors"
                                        >
                                            <div className="flex justify-between items-start">
                                                <div className="flex-1">
                                                    <div className="flex items-center gap-3 mb-2">
                                                        <h3 className="text-lg font-semibold text-gray-900">
                                                            {branch.cityName}
                                                        </h3>
                                                        <span className="text-sm text-gray-600 font-mono bg-gray-200 px-2 py-1 rounded">
                                                            {branch.slug}
                                                        </span>
                                                        {branch.isActive ? (
                                                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                                                Active
                                                            </span>
                                                        ) : (
                                                            <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                                                                Inactive
                                                            </span>
                                                        )}
                                                    </div>
                                                    {branch.address && (
                                                        <p className="text-sm text-gray-600 mb-1">
                                                            📍 {branch.address}
                                                        </p>
                                                    )}
                                                    {branch.phones.length > 0 && (
                                                        <p className="text-sm text-gray-600">
                                                            📞 {branch.phones.join(", ")}
                                                        </p>
                                                    )}
                                                    <p className="text-xs text-gray-500 mt-2">
                                                        Created: {new Date(branch.createdAt).toLocaleDateString()}
                                                    </p>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )
            }
        </div >
    );
}
