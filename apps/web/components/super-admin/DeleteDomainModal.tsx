/**
 * Delete Domain Confirmation Modal
 */

'use client';

import { useState } from 'react';
import { deleteDomain } from '@/lib/api/domains';

interface DeleteDomainModalProps {
    domain: {
        id: string;
        domain: string;
        tenantId: string;
    };
    onClose: () => void;
    onSuccess: () => void;
}

export function DeleteDomainModal({ domain, onClose, onSuccess }: DeleteDomainModalProps) {
    const [deleting, setDeleting] = useState(false);
    const [error, setError] = useState('');

    async function handleDelete() {
        setDeleting(true);
        setError('');

        try {
            await deleteDomain(domain.tenantId, domain.id);
            onSuccess();
        } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : 'Failed to delete domain';
            setError(msg);
        } finally {
            setDeleting(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
                <h2 className="text-xl font-bold mb-4">Delete Domain</h2>
                <p className="text-gray-700 mb-6">
                    Are you sure you want to delete <strong className="text-red-600">{domain.domain}</strong>?
                    This action cannot be undone.
                </p>

                {error && (
                    <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                        {error}
                    </div>
                )}

                <div className="flex justify-end gap-2">
                    <button
                        onClick={onClose}
                        disabled={deleting}
                        className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        disabled={deleting}
                        className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                    >
                        {deleting ? 'Deleting...' : 'Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
}
