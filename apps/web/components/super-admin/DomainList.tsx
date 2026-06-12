/**
 * Domain List Component
 * 
 * Table displaying all domains with actions
 */

'use client';

import { useState } from 'react';
import { StatusBadge } from './StatusBadge';
import { DomainDisplay } from './DomainDisplay';
import { DeleteDomainModal } from './DeleteDomainModal';
import { verifyDomain } from '@/lib/api/domains';

export interface Domain {
    id: string;
    domain: string;
    status: 'PENDING' | 'VERIFIED' | 'FAILED';
    provider: string;
    isWildcard: boolean;
    createdAt: string;
    verifiedAt?: string;
    tenantId: string;
    // Extended fields for setup
    txtRecord?: string;
    cnameTarget?: string;
    dnsInstructions?: {
        txtRecord: { type: string; name: string; value: string };
        cnameRecord?: { type: string; name: string; value: string };
    };
}

interface DomainListProps {
    domains: Domain[];
    tenantId: string;
    onRefresh: () => void;
    onShowInstructions: (domain: Domain) => void;
}

export function DomainList({ domains, tenantId, onRefresh, onShowInstructions }: DomainListProps) {
    const [verifying, setVerifying] = useState<string | null>(null);
    const [deleteTarget, setDeleteTarget] = useState<Domain | null>(null);

    async function handleVerify(domainId: string) {
        setVerifying(domainId);
        try {
            const result = await verifyDomain(tenantId, domainId);
            if (result.success) {
                alert('✅ Domain verified successfully!');
                onRefresh();
            } else {
                alert(`❌ Verification failed: ${result.error}`);
            }
        } catch (error: unknown) {
            const msg = error instanceof Error ? error.message : "Unknown error";
            alert(`❌ Failed to verify domain: ${msg}`);
        } finally {
            setVerifying(null);
        }
    }

    return (
        <>
            <div className="bg-paper rounded-theme shadow-theme overflow-hidden">
                <table className="min-w-full divide-y divide-[var(--line)]">
                    <thead className="bg-[var(--bg)]">
                        <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                Domain
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                Provider
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-muted uppercase tracking-wider">
                                Created
                            </th>
                            <th className="px-6 py-3 text-right text-xs font-medium text-muted uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-paper divide-y divide-[var(--line)]">
                        {domains.map((domain) => (
                            <tr key={domain.id} className="hover:bg-[var(--bg)]">
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <DomainDisplay domain={domain.domain} />
                                    {domain.isWildcard && (
                                        <span className="ml-2 text-xs text-purple-600">*</span>
                                    )}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap">
                                    <StatusBadge status={domain.status} />
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap capitalize text-sm text-muted">
                                    {domain.provider}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-sm text-muted">
                                    {new Date(domain.createdAt).toLocaleDateString()}
                                </td>
                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                    {domain.status === 'PENDING' && (
                                        <button
                                            onClick={() => handleVerify(domain.id)}
                                            disabled={verifying === domain.id}
                                            className="text-blue-600 hover:text-blue-900 mr-4 disabled:opacity-50"
                                        >
                                            {verifying === domain.id ? '⏳ Verifying...' : 'Verify'}
                                        </button>
                                    )}
                                    <button
                                        onClick={() => onShowInstructions(domain)}
                                        className="text-muted hover:text-ink mr-4"
                                    >
                                        Setup
                                    </button>
                                    <button
                                        onClick={() => setDeleteTarget(domain)}
                                        className="text-red-600 hover:text-red-900"
                                    >
                                        Delete
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                {domains.length === 0 && (
                    <div className="text-center py-12 text-muted">
                        <div className="text-4xl mb-2">🌐</div>
                        <p>No custom domains configured yet</p>
                        <p className="text-sm mt-1">Click "Add Domain" to get started</p>
                    </div>
                )}
            </div>

            {deleteTarget && (
                <DeleteDomainModal
                    domain={deleteTarget}
                    onClose={() => setDeleteTarget(null)}
                    onSuccess={() => {
                        setDeleteTarget(null);
                        onRefresh();
                    }}
                />
            )}
        </>
    );
}
