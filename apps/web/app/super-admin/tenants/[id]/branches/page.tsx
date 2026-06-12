'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getTenantBranchesAction, createBranchAction, updateBranchAction, getSuperTenantByIdAction } from '@/app/actions';

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

interface CreateBranchForm {
    name: string;
    slug: string;
    cityName: string;
    address: string;
    phone: string;
}

export default function TenantBranchesPage() {
    const params = useParams();
    const tenantId = params.id as string;

    const [branches, setBranches] = useState<Branch[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [tenantSlug, setTenantSlug] = useState<string | null>(null);
    const [searchBranch, setSearchBranch] = useState('');
    const [showAddForm, setShowAddForm] = useState(false);
    const [formData, setFormData] = useState<CreateBranchForm>({
        name: '',
        slug: '',
        cityName: '',
        address: '',
        phone: '',
    });
    const [formError, setFormError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    // Edit state
    const [editingBranch, setEditingBranch] = useState<Branch | null>(null);
    const [editFormData, setEditFormData] = useState<Partial<Branch>>({});

    const loadBranches = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getTenantBranchesAction(tenantId);
            setBranches(data);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'An error occurred');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        loadBranches();
    }, [loadBranches]);

    useEffect(() => {
        let isMounted = true;
        async function loadTenantSlug() {
            if (!isMounted) return;
            setError("");
            try {
                const tenant = await getSuperTenantByIdAction(tenantId);
                if (!isMounted) return;
                if (tenant === null) {
                    setTenantSlug(null);
                    setError("Tenant not found");
                } else {
                    setTenantSlug(tenant.slug);
                    setError('');
                }
            } catch (e: unknown) {
                if (!isMounted) return;
                setTenantSlug(null);
                setError("Failed to load tenant");
            }
        }
        loadTenantSlug();
        return () => {
            isMounted = false;
        };
    }, [tenantId]);

    const handleCreate = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        if (!tenantSlug) {
            const isTenantNotFound = error === "Tenant not found";
            setFormError(isTenantNotFound ? "Tenant not found" : 'Unable to resolve tenant slug');
            return;
        }
        setSubmitting(true);

        try {
            await createBranchAction(tenantId, formData, tenantSlug);
            setShowAddForm(false);
            setFormData({ name: '', slug: '', cityName: '', address: '', phone: '' });
            loadBranches();
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    }, [tenantId, formData, tenantSlug, loadBranches, error]);

    const handleUpdate = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingBranch) return;

        setFormError('');
        if (!tenantSlug) {
            const isTenantNotFound = error === "Tenant not found";
            setFormError(isTenantNotFound ? "Tenant not found" : 'Unable to resolve tenant slug');
            return;
        }
        setSubmitting(true);

        try {
            // Filter out undefined/null values
            const updates = Object.fromEntries(
                Object.entries(editFormData).filter(([, v]) => v !== undefined && v !== null)
            );
            await updateBranchAction(tenantId, editingBranch.id, updates, tenantSlug);
            setEditingBranch(null);
            setEditFormData({});
            loadBranches();
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : 'An error occurred');
        } finally {
            setSubmitting(false);
        }
    }, [tenantId, editingBranch, editFormData, tenantSlug, loadBranches, error]);

    const filteredBranches = branches.filter(b =>
        b.cityName.toLowerCase().includes(searchBranch.toLowerCase()) ||
        b.slug.toLowerCase().includes(searchBranch.toLowerCase())
    );

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="mb-6">
                    <a
                        href="/super-admin"
                        className="mb-4 inline-block text-blue-600 hover:text-blue-800 font-semibold"
                    >
                        ← Back to Super Admin
                    </a>
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">
                        Branches Management
                    </h1>
                    <p className="text-gray-600">
                        Manage branches for tenant
                    </p>
                </div>

                {/* Actions */}
                <div className="mb-6 flex gap-3">
                    {!showAddForm && (
                        <>
                            <button
                                onClick={() => setShowAddForm(true)}
                                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                            >
                                + Add Branch
                            </button>
                            <a
                                href={`/super-admin/tenants/${tenantId}/domains`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition font-semibold"
                            >
                                🌐 Manage Domains
                            </a>
                        </>
                    )}
                    <input
                        type="text"
                        placeholder="Search branches by city or slug..."
                        value={searchBranch}
                        onChange={(e) => setSearchBranch(e.target.value)}
                        className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                </div>

                {/* Error */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
                        {error}
                    </div>
                )}

                {/* Add Form */}
                {showAddForm && (
                    <div className="mb-6 p-6 bg-white rounded-lg shadow-lg border border-gray-200">
                        <h3 className="text-xl font-bold mb-4">Create New Branch</h3>
                        {formError && (
                            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                {formError}
                            </div>
                        )}
                        <form onSubmit={handleCreate}>
                            {/* form fields same as before */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Branch Name</label>
                                    <input
                                        type="text"
                                        value={formData.name}
                                        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Slug</label>
                                    <input
                                        type="text"
                                        value={formData.slug}
                                        onChange={(e) => setFormData({ ...formData, slug: e.target.value.toLowerCase() })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                                        pattern="[a-z0-9-]+"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">City</label>
                                    <input
                                        type="text"
                                        value={formData.cityName}
                                        onChange={(e) => setFormData({ ...formData, cityName: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        required
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Phone</label>
                                    <input
                                        type="tel"
                                        value={formData.phone}
                                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold mb-1">Address</label>
                                    <input
                                        type="text"
                                        value={formData.address}
                                        onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-4">
                                <button
                                    type="button"
                                    onClick={() => {
                                        setShowAddForm(false);
                                        setFormError('');
                                        setFormData({ name: '', slug: '', cityName: '', address: '', phone: '' });
                                    }}
                                    className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                                    disabled={submitting}
                                >
                                    Cancel
                                </button>
                                <button
                                    type="submit"
                                    className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                                    disabled={submitting}
                                >
                                    {submitting ? 'Creating...' : 'Create Branch'}
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {/* Edit Modal */}
                {editingBranch && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
                        <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6">
                            <h3 className="text-2xl font-bold mb-4">Edit Branch: {editingBranch.cityName}</h3>
                            {formError && (
                                <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                    {formError}
                                </div>
                            )}
                            <form onSubmit={handleUpdate}>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">Slug</label>
                                        <input
                                            type="text"
                                            value={editFormData.slug ?? editingBranch.slug}
                                            onChange={(e) => setEditFormData({ ...editFormData, slug: e.target.value.toLowerCase() })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                                            pattern="[a-z0-9-]+"
                                        />
                                        <p className="text-xs text-gray-500 mt-1">⚠️ Changing slug will change URLs</p>
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold mb-1">City Name</label>
                                        <input
                                            type="text"
                                            value={editFormData.cityName ?? editingBranch.cityName}
                                            onChange={(e) => setEditFormData({ ...editFormData, cityName: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                    <div className="md:col-span-2">
                                        <label className="block text-sm font-semibold mb-1">Address</label>
                                        <input
                                            type="text"
                                            value={editFormData.address ?? editingBranch.address ?? ''}
                                            onChange={(e) => setEditFormData({ ...editFormData, address: e.target.value })}
                                            className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                        />
                                    </div>
                                </div>
                                <div className="flex gap-3 mt-6">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            setEditingBranch(null);
                                            setEditFormData({});
                                            setFormError('');
                                        }}
                                        className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                                        disabled={submitting}
                                    >
                                        Cancel
                                    </button>
                                    <button
                                        type="submit"
                                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                                        disabled={submitting}
                                    >
                                        {submitting ? 'Saving...' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                )}

                {/* Branches Table */}
                {loading ? (
                    <div className="bg-white rounded-lg shadow p-12 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                        <p className="text-gray-500">Loading branches...</p>
                    </div>
                ) : filteredBranches.length === 0 ? (
                    <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
                        {searchBranch ? 'No branches match your search' : 'No branches yet. Create one above.'}
                    </div>
                ) : (
                    <div className="bg-white rounded-lg shadow overflow-hidden">
                        <table className="w-full">
                            <thead className="bg-gray-800 text-white">
                                <tr>
                                    <th className="px-6 py-4 text-left text-sm font-semibold">City</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold">Slug</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold">Address</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold">Phone</th>
                                    <th className="px-6 py-4 text-left text-sm font-semibold">Status</th>
                                    <th className="px-6 py-4 text-center text-sm font-semibold">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-200">
                                {filteredBranches.map((branch) => (
                                    <tr key={branch.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 font-semibold">{branch.cityName}</td>
                                        <td className="px-6 py-4">
                                            <span className="font-mono text-sm bg-gray-100 px-2 py-1 rounded">
                                                {branch.slug}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {branch.address || '-'}
                                        </td>
                                        <td className="px-6 py-4 text-sm text-gray-600">
                                            {branch.phones.join(', ') || '-'}
                                        </td>
                                        <td className="px-6 py-4">
                                            {branch.isActive ? (
                                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-green-100 text-green-800">
                                                    Active
                                                </span>
                                            ) : (
                                                <span className="px-2 py-1 rounded-full text-xs font-semibold bg-red-100 text-red-800">
                                                    Inactive
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button
                                                onClick={() => {
                                                    setEditingBranch(branch);
                                                    setEditFormData({});
                                                    setFormError('');
                                                }}
                                                className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                                            >
                                                ✏️ Edit
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* Stats */}
                {!loading && branches.length > 0 && (
                    <div className="mt-4 text-sm text-gray-600">
                        Showing {filteredBranches.length} of {branches.length} branches
                    </div>
                )}
            </div>
        </div>
    );
}
