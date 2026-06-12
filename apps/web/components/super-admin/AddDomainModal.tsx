/**
 * Add Domain Modal
 * 
 * Modal with real-time validation and provider selection
 */

'use client';

import { useState } from 'react';
import { validateCustomDomain } from '@/lib/domain-validation';
import { fetchClient } from "../../lib/api/fetchClient";

import { Domain } from './DomainList';

interface AddDomainModalProps {
    tenantId: string;
    onClose: () => void;
    onSuccess: (data: Domain) => void;
}

export function AddDomainModal({ tenantId, onClose, onSuccess }: AddDomainModalProps) {
    const [domain, setDomain] = useState('');
    const [provider, setProvider] = useState<'vercel' | 'cloudflare' | 'custom'>('vercel');
    const [customCname, setCustomCname] = useState('');
    const [isWildcard, setIsWildcard] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Real-time validation
    const validation = validateCustomDomain(domain);
    const canSubmit = domain && validation.valid && !submitting;

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        if (!canSubmit) return;

        setSubmitting(true);
        setError('');

        try {
            const res = await fetchClient(`/api/super-admin/tenants/${tenantId}/domains`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    domain,
                    provider,
                    customCnameTarget: provider === 'custom' ? customCname : undefined,
                    isWildcard
                })
            });

            const data = await res.json();

            if (res.ok) {
                onSuccess(data);
            } else {
                setError(data.error || data.details || 'Failed to add domain');
            }
        } catch (err) {
            setError('Network error');
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
                <h2 className="text-xl font-bold mb-4">Add Custom Domain</h2>

                <form onSubmit={handleSubmit}>
                    {/* Domain Input */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Domain Name
                        </label>
                        <input
                            type="text"
                            value={domain}
                            onChange={(e) => setDomain(e.target.value.toLowerCase().trim())}
                            placeholder="example.com"
                            className="w-full px-3 py-2 border rounded focus:ring-blue-500 focus:border-blue-500"
                            autoFocus
                        />
                        {domain && !validation.valid && (
                            <p className="mt-1 text-sm text-red-600">{validation.error}</p>
                        )}
                        {validation.suggestion && (
                            <p className="mt-1 text-sm text-blue-600">
                                Did you mean: <strong>{validation.suggestion}</strong>?
                            </p>
                        )}
                    </div>

                    {/* Provider Selector */}
                    <div className="mb-4">
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Infrastructure Provider
                        </label>
                        <select
                            value={provider}
                            onChange={(e) => setProvider(e.target.value as 'vercel' | 'cloudflare' | 'custom')}
                            className="w-full px-3 py-2 border rounded"
                        >
                            <option value="vercel">Vercel</option>
                            <option value="cloudflare">Cloudflare (Coming Soon)</option>
                            <option value="custom">Custom (Self-Hosted)</option>
                        </select>
                        <p className="mt-1 text-xs text-gray-500">
                            {provider === 'vercel' && 'Automatic DNS configuration via Vercel API'}
                            {provider === 'cloudflare' && 'Cloudflare support coming soon'}
                            {provider === 'custom' && 'Manual DNS configuration required'}
                        </p>
                    </div>

                    {/* Custom CNAME (if provider = custom) */}
                    {provider === 'custom' && (
                        <div className="mb-4">
                            <label className="block text-sm font-medium text-gray-700 mb-2">
                                CNAME Target
                            </label>
                            <input
                                type="text"
                                value={customCname}
                                onChange={(e) => setCustomCname(e.target.value.trim())}
                                placeholder="your-server.com"
                                className="w-full px-3 py-2 border rounded"
                            />
                            <p className="mt-1 text-xs text-gray-500">
                                Point your domain to this server
                            </p>
                        </div>
                    )}

                    {/* Wildcard Toggle */}
                    <div className="mb-4">
                        <label className="flex items-center">
                            <input
                                type="checkbox"
                                checked={isWildcard}
                                onChange={(e) => setIsWildcard(e.target.checked)}
                                className="mr-2"
                            />
                            <span className="text-sm text-gray-700">
                                Enable wildcard (*.example.com)
                            </span>
                        </label>
                        <p className="mt-1 ml-6 text-xs text-gray-500">
                            Allow all subdomains to work with this configuration
                        </p>
                    </div>

                    {error && (
                        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
                            {error}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex justify-end gap-2">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded"
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!canSubmit}
                            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {submitting ? 'Adding...' : 'Add Domain'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
