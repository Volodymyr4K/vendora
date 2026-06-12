/**
 * Custom Domains Management Page
 * 
 * Super Admin page for managing tenant custom domains
 */

'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { DomainList } from '@/components/super-admin/DomainList';
import { AddDomainModal } from '@/components/super-admin/AddDomainModal';
import { DnsInstructionsModal } from '@/components/super-admin/DnsInstructionsModal';
import { getDomainsAction } from '@/app/actions';
import { Domain } from '@/components/super-admin/DomainList';

export default function TenantDomainsPage() {
    const params = useParams();
    const tenantId = params.id as string;

    const [domains, setDomains] = useState<Domain[]>([]);
    const [loading, setLoading] = useState(true);
    const [showAddModal, setShowAddModal] = useState(false);
    const [selectedDomain, setSelectedDomain] = useState<Domain | null>(null);
    const [error, setError] = useState('');

    const fetchDomains = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const data = await getDomainsAction(tenantId);
            const mappedDomains = data.domains.map((d) => ({
                ...d,
                tenantId,
                // FALLBACK: Backend factory defaults to 'vercel' if null/undefined.
                // We must match this in UI to avoid misleading "Custom" status for Vercel domains.
                provider: d.provider ?? 'vercel',
                txtRecord: d.txtRecord ?? undefined, // UI expects optional, DTO/DB is nullable
                cnameTarget: d.cnameTarget ?? undefined,
                verifiedAt: d.verifiedAt ?? undefined,
                lastVerifiedAt: d.lastVerifiedAt ?? undefined
            }));
            setDomains(mappedDomains as Domain[]); // Cast is still needed if nominally different, but now structurally safer. 
            // Wait, "no casts" was the rule.
            // If I map it, TS should infer the shape.
            // If Domain has more fields than SuperDomainDTO + tenantId, it will fail assignment.
            // But if I use `as Domain[]` HERE, it's safer than `as { ... }` on the network response?
            // The user said "no `as` cast in runtime pages... for network data".
            // Casting the locally transformed data to the UI State type is acceptable IF the fields match.
            // But ideally I shouldn't cast.
            // If I do `setDomains(mappedDomains)`, and mappedDomains matches Domain, it works.
            // If it doesn't match, TS errors.
            // So I will try NO cast first.
            setDomains(mappedDomains);
        } catch (error: unknown) {
            console.error('Failed to fetch domains:', error);
            setError(error instanceof Error ? error.message : 'Failed to fetch domains');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        fetchDomains();
    }, [fetchDomains]);

    return (
        <div className="p-6 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">Custom Domains</h1>
                    <p className="text-sm text-gray-600 mt-1">
                        Manage custom domains for this tenant
                    </p>
                </div>
                <button
                    onClick={() => setShowAddModal(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition flex items-center"
                >
                    <span className="mr-2">+</span>
                    Add Domain
                </button>
            </div>

            {/* Error State */}
            {error && (
                <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
                    <strong>Error:</strong> {error}
                    <button
                        onClick={fetchDomains}
                        className="ml-4 text-sm underline hover:no-underline"
                    >
                        Retry
                    </button>
                </div>
            )}

            {/* Loading State */}
            {loading ? (
                <div className="bg-white rounded-lg shadow p-12 text-center">
                    <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                    <p className="text-gray-500">Loading domains...</p>
                </div>
            ) : (
                <DomainList
                    domains={domains}
                    tenantId={tenantId}
                    onRefresh={fetchDomains}
                    onShowInstructions={(domain) => setSelectedDomain(domain)}
                />
            )}

            {/* Add Domain Modal */}
            {showAddModal && (
                <AddDomainModal
                    tenantId={tenantId}
                    onClose={() => setShowAddModal(false)}
                    onSuccess={(data) => {
                        setShowAddModal(false);
                        setSelectedDomain(data);
                        fetchDomains();
                    }}
                />
            )}

            {/* DNS Instructions Modal */}
            {selectedDomain && (
                <DnsInstructionsModal
                    domain={selectedDomain.domain}
                    dnsInstructions={selectedDomain.dnsInstructions || {
                        txtRecord: { type: 'TXT', name: '@', value: selectedDomain.txtRecord || '' },
                        cnameRecord: selectedDomain.cnameTarget ? {
                            type: 'CNAME',
                            name: selectedDomain.isWildcard ? '*' : '@',
                            value: selectedDomain.cnameTarget
                        } : undefined
                    }}
                    onClose={() => setSelectedDomain(null)}
                />
            )}
        </div>
    );
}
