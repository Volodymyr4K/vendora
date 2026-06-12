'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import {
    createPaymentProviderAction,
    getPaymentProvidersAction,
    patchPaymentProviderAction,
    refreshMonobankPaymentProviderPubkeyAction,
    rotatePaymentProviderWebhookTokenAction,
} from '@/app/actions';

type PaymentProviderRow = Awaited<ReturnType<typeof getPaymentProvidersAction>>['items'][number];

type CreateProviderForm = {
    type: PaymentProviderRow['type'];
    mode: PaymentProviderRow['mode'];
    status: PaymentProviderRow['status'];
    credentialsRef: string;
    webhookToken: string;
    liqpayPublicKey: string;
    liqpayCurrentSecretRef: string;
    liqpayPreviousSecretRef: string;
    liqpayPreviousValidUntil: string;
    liqpaySignatureOutAlgorithm: 'sha1' | 'sha3-256';
    liqpaySignatureInAlgorithms: Array<'sha1' | 'sha3-256'>;
};

function base64UrlFromBytes(bytes: Uint8Array) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function generateWebhookToken(length = 40) {
    const bytes = new Uint8Array(Math.ceil((length * 3) / 4));
    crypto.getRandomValues(bytes);
    return base64UrlFromBytes(bytes).slice(0, length);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function extractWebhookTokens(config: unknown): string[] {
    if (!isPlainObject(config)) return [];
    const raw = config.webhookTokens;
    if (!Array.isArray(raw)) return [];
    return raw.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim());
}

function mergeConfigWithWebhookTokens(provider: PaymentProviderRow, webhookTokens: string[]) {
    const base = isPlainObject(provider.config) ? { ...(provider.config as Record<string, unknown>) } : {};
    const withTokens: Record<string, unknown> = { ...base, webhookTokens };
    if (provider.type === 'MONOBANK') {
        const existing = withTokens.monobank;
        if (!isPlainObject(existing)) withTokens.monobank = {};
    }
    return withTokens;
}

function isValidWebhookToken(token: string) {
    return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

function getMonobankPubkeyCount(config: unknown) {
    if (!isPlainObject(config)) return 0;
    const monobank = config.monobank;
    if (!isPlainObject(monobank)) return 0;
    const keysRaw = monobank.webhookPublicKeysPem;
    if (!Array.isArray(keysRaw)) return 0;
    return keysRaw.filter((k): k is string => typeof k === 'string' && k.trim().length > 0).length;
}

function getLiqpayConfig(config: unknown) {
    if (!isPlainObject(config)) return null;
    const liqpay = config.liqpay;
    return isPlainObject(liqpay) ? liqpay : null;
}

function getLiqpaySecretRefs(config: unknown) {
    const liqpay = getLiqpayConfig(config);
    if (!liqpay) return { currentSecretRef: '', previousSecretRef: '', previousValidUntil: '' };
    const currentSecretRef = typeof liqpay.currentSecretRef === 'string' ? liqpay.currentSecretRef.trim() : '';
    const previousSecretRef = typeof liqpay.previousSecretRef === 'string' ? liqpay.previousSecretRef.trim() : '';
    const previousValidUntil = typeof liqpay.previousValidUntil === 'string' ? liqpay.previousValidUntil.trim() : '';
    return { currentSecretRef, previousSecretRef, previousValidUntil };
}

type Readiness = {
    level: 'READY' | 'NOT_READY';
    issues: string[];
    hints: string[];
};

function computeReadiness(provider: PaymentProviderRow): Readiness {
    const issues: string[] = [];
    const hints: string[] = [];

    const tokens = extractWebhookTokens(provider.config).filter(isValidWebhookToken);
    if (tokens.length === 0) issues.push('Missing valid webhook token');
    if (tokens.length > 2) hints.push('Consider keeping at most 2 tokens (current+previous)');

    if (provider.type === 'MOLLIE') {
        if (!provider.credentialsRef) issues.push('Missing credentialsRef (required for ACTIVE)');
        hints.push('Activation requires matching env secret on BFF');
    }

    if (provider.type === 'MONOBANK') {
        if (!provider.credentialsRef) issues.push('Missing credentialsRef (required for ACTIVE)');
        const pubkeys = getMonobankPubkeyCount(provider.config);
        if (pubkeys === 0) issues.push('Missing Monobank webhook public key (refresh pubkey)');
        hints.push('Activation requires matching env secret on BFF');
    }

    if (provider.type === 'LIQPAY') {
        const liqpay = getLiqpayConfig(provider.config);
        if (!liqpay) {
            issues.push('Missing liqpay config');
        } else {
            const publicKey = typeof liqpay.publicKey === 'string' ? liqpay.publicKey.trim() : '';
            const currentSecretRef = typeof liqpay.currentSecretRef === 'string' ? liqpay.currentSecretRef.trim() : '';
            const signatureOutAlgorithm = liqpay.signatureOutAlgorithm;
            const signatureInAlgorithmsRaw = liqpay.signatureInAlgorithms;
            const signatureInAlgorithms = Array.isArray(signatureInAlgorithmsRaw)
                ? signatureInAlgorithmsRaw.filter((a): a is string => a === 'sha1' || a === 'sha3-256')
                : [];
            const version = Number(liqpay.version);

            if (!publicKey) issues.push('Missing liqpay.publicKey');
            if (!currentSecretRef) issues.push('Missing liqpay.currentSecretRef');
            if (signatureInAlgorithms.length === 0) issues.push('Missing liqpay.signatureInAlgorithms');
            if (signatureOutAlgorithm !== 'sha1' && signatureOutAlgorithm !== 'sha3-256') issues.push('Invalid liqpay.signatureOutAlgorithm');
            if (version !== 3) issues.push('Invalid liqpay.version (expected 3)');
        }
        hints.push('Activation requires matching env secret(s) on BFF');
    }

    if (provider.status === 'ACTIVE') {
        issues.push('Provider is ACTIVE (should not be active during setup)');
    }

    return {
        level: issues.length === 0 ? 'READY' : 'NOT_READY',
        issues,
        hints,
    };
}

function formatIsoDateShort(value: string | undefined) {
    if (!value) return '';
    const ms = Date.parse(value);
    if (!Number.isFinite(ms)) return value;
    return new Date(ms).toLocaleString();
}

function providerSlug(type: PaymentProviderRow['type']): 'mollie' | 'monobank' | 'liqpay' {
    if (type === 'MOLLIE') return 'mollie';
    if (type === 'MONOBANK') return 'monobank';
    return 'liqpay';
}

export default function TenantPaymentProvidersPage() {
    const params = useParams();
    const tenantId = params.id as string;

    const [providers, setProviders] = useState<PaymentProviderRow[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    const [showAddForm, setShowAddForm] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formError, setFormError] = useState('');
    const [rotateError, setRotateError] = useState('');
    const [monobankRefreshError, setMonobankRefreshError] = useState('');
    const [monobankRefreshedProviderId, setMonobankRefreshedProviderId] = useState<string | null>(null);
    const [editError, setEditError] = useState('');

    const [keepPreviousTokenOnRotate, setKeepPreviousTokenOnRotate] = useState(true);
    const [revealedProviderIds, setRevealedProviderIds] = useState<Record<string, boolean>>({});
    const [latestNewToken, setLatestNewToken] = useState<{ providerId: string; token: string } | null>(null);
    const [copiedWebhookKey, setCopiedWebhookKey] = useState<string | null>(null);
    const [expandedChecklistProviderIds, setExpandedChecklistProviderIds] = useState<Record<string, boolean>>({});

    const [editingProvider, setEditingProvider] = useState<PaymentProviderRow | null>(null);
    const [editCredentialsRef, setEditCredentialsRef] = useState('');
    const [editWebhookTokensText, setEditWebhookTokensText] = useState('');
    const [editSubmitting, setEditSubmitting] = useState(false);

    const [formData, setFormData] = useState<CreateProviderForm>({
        type: 'MOLLIE',
        mode: 'TEST',
        status: 'DISABLED',
        credentialsRef: '',
        webhookToken: generateWebhookToken(),
        liqpayPublicKey: '',
        liqpayCurrentSecretRef: '',
        liqpayPreviousSecretRef: '',
        liqpayPreviousValidUntil: '',
        liqpaySignatureOutAlgorithm: 'sha3-256',
        liqpaySignatureInAlgorithms: ['sha3-256'],
    });

    const loadProviders = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const res = await getPaymentProvidersAction(tenantId);
            setProviders(res.items);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Failed to load payment providers');
        } finally {
            setLoading(false);
        }
    }, [tenantId]);

    useEffect(() => {
        loadProviders();
    }, [loadProviders]);

    const sortedProviders = useMemo(() => {
        return [...providers].sort((a, b) => {
            const aKey = `${a.type}:${a.mode}:${a.createdAt ?? ''}`;
            const bKey = `${b.type}:${b.mode}:${b.createdAt ?? ''}`;
            return aKey.localeCompare(bKey);
        });
    }, [providers]);

    const handleRotateToken = useCallback(async (providerId: string) => {
        setRotateError('');
        setMonobankRefreshError('');
        setMonobankRefreshedProviderId(null);
        setEditError('');
        setLatestNewToken(null);
        try {
            const res = await rotatePaymentProviderWebhookTokenAction(tenantId, providerId, {
                keepPrevious: keepPreviousTokenOnRotate,
            });
            setProviders((prev) => prev.map((p) => (p.id === providerId ? res.provider : p)));
            setLatestNewToken({ providerId, token: res.newToken });
            setRevealedProviderIds((prev) => ({ ...prev, [providerId]: true }));
        } catch (e: unknown) {
            setRotateError(e instanceof Error ? e.message : 'Failed to rotate webhook token');
        }
    }, [tenantId, keepPreviousTokenOnRotate]);

    const handleRefreshMonobankPubkey = useCallback(async (providerId: string) => {
        setRotateError('');
        setMonobankRefreshError('');
        setMonobankRefreshedProviderId(null);
        setEditError('');
        setLatestNewToken(null);
        try {
            await refreshMonobankPaymentProviderPubkeyAction(tenantId, providerId);
            setMonobankRefreshedProviderId(providerId);
            await loadProviders();
        } catch (e: unknown) {
            setMonobankRefreshError(e instanceof Error ? e.message : 'Failed to refresh Monobank pubkey');
        }
    }, [tenantId, loadProviders]);

    const handleCopyWebhookUrl = useCallback(async (provider: PaymentProviderRow, token: string, idx: number) => {
        setCopiedWebhookKey(null);
        const origin = window.location.origin;
        const url = `${origin}/api/webhooks/payments/${providerSlug(provider.type)}/${provider.id}?t=${encodeURIComponent(token)}`;
        try {
            await navigator.clipboard.writeText(url);
            const key = `${provider.id}:${idx}`;
            setCopiedWebhookKey(key);
            window.setTimeout(() => setCopiedWebhookKey(null), 1200);
        } catch {
            // ignore
        }
    }, []);

    const toggleChecklist = useCallback((providerId: string) => {
        setExpandedChecklistProviderIds((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
    }, []);

    const openEdit = useCallback((provider: PaymentProviderRow) => {
        setRotateError('');
        setMonobankRefreshError('');
        setMonobankRefreshedProviderId(null);
        setEditError('');
        setLatestNewToken(null);

        setEditingProvider(provider);
        setEditCredentialsRef(provider.credentialsRef ?? '');
        const tokens = extractWebhookTokens(provider.config);
        setEditWebhookTokensText(tokens.join('\n'));
    }, []);

    const closeEdit = useCallback(() => {
        setEditingProvider(null);
        setEditCredentialsRef('');
        setEditWebhookTokensText('');
        setEditError('');
        setEditSubmitting(false);
    }, []);

    const handleSaveEdit = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editingProvider) return;
        setEditSubmitting(true);
        setEditError('');

        try {
            const tokens = editWebhookTokensText
                .split('\n')
                .map((t) => t.trim())
                .filter((t) => t.length > 0);
            const uniqueTokens = Array.from(new Set(tokens));

            const config = mergeConfigWithWebhookTokens(editingProvider, uniqueTokens);

            const updated = await patchPaymentProviderAction(tenantId, editingProvider.id, {
                // Safety: don’t allow activation from this UI (keys not available yet).
                status: 'DISABLED',
                credentialsRef: editCredentialsRef.trim() ? editCredentialsRef.trim() : null,
                config,
            });

            setProviders((prev) => prev.map((p) => (p.id === editingProvider.id ? updated : p)));
            closeEdit();
        } catch (e: unknown) {
            setEditError(e instanceof Error ? e.message : 'Failed to save changes');
        } finally {
            setEditSubmitting(false);
        }
    }, [editingProvider, editWebhookTokensText, tenantId, editCredentialsRef, closeEdit]);

    const toggleReveal = useCallback((providerId: string) => {
        setRevealedProviderIds((prev) => ({ ...prev, [providerId]: !prev[providerId] }));
    }, []);

    const handleCreate = useCallback(async (e: React.FormEvent) => {
        e.preventDefault();
        setFormError('');
        setLatestNewToken(null);
        setSubmitting(true);

        try {
            const baseConfig: Record<string, unknown> = { webhookTokens: [formData.webhookToken.trim()] };
            const config =
                formData.type === 'MONOBANK'
                    ? { ...baseConfig, monobank: {} }
                    : formData.type === 'LIQPAY'
                        ? {
                            ...baseConfig,
                            liqpay: {
                                publicKey: formData.liqpayPublicKey.trim(),
                                currentSecretRef: formData.liqpayCurrentSecretRef.trim(),
                                previousSecretRef: formData.liqpayPreviousSecretRef.trim() || undefined,
                                previousValidUntil: formData.liqpayPreviousValidUntil.trim() || undefined,
                                signatureOutAlgorithm: formData.liqpaySignatureOutAlgorithm,
                                signatureInAlgorithms: formData.liqpaySignatureInAlgorithms,
                                version: 3,
                            },
                        }
                        : baseConfig;

            const created = await createPaymentProviderAction(tenantId, {
                type: formData.type,
                mode: formData.mode,
                // Safety: never allow activation from this UI.
                status: 'DISABLED',
                credentialsRef: formData.credentialsRef.trim() || null,
                config,
            });

            setProviders((prev) => [created, ...prev]);
            setShowAddForm(false);
            setFormData((prev) => ({
                ...prev,
                status: 'DISABLED',
                credentialsRef: '',
                webhookToken: generateWebhookToken(),
            }));
        } catch (e: unknown) {
            setFormError(e instanceof Error ? e.message : 'Failed to create provider');
        } finally {
            setSubmitting(false);
        }
    }, [tenantId, formData]);

    const liqpayFieldsVisible = showAddForm && formData.type === 'LIQPAY';

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 p-8">
            <div className="max-w-6xl mx-auto">
                <div className="mb-6">
                    <a
                        href="/super-admin"
                        className="mb-4 inline-block text-blue-600 hover:text-blue-800 font-semibold"
                    >
                        ← Back to Super Admin
                    </a>
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Payment Providers</h1>
                    <p className="text-gray-600">Super-admin only: manage payment provider configuration for this tenant.</p>
                </div>

                <div className="mb-6 p-5 bg-white rounded-lg shadow border border-gray-200">
                    <div className="flex items-start justify-between gap-4">
                        <div>
                            <div className="text-lg font-bold text-gray-900">Go-live rehearsal (safe)</div>
                            <div className="text-sm text-gray-600 mt-1">
                                This page is intentionally “safe-mode”: it never activates providers. Use it to prepare config, copy webhook URLs, rotate tokens,
                                and verify readiness before enabling secrets.
                            </div>
                        </div>
                    </div>
                    <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                            <div className="font-semibold text-gray-900">1) Create (DISABLED)</div>
                            <div className="text-gray-600 mt-1">Add provider in TEST/LIVE as DISABLED.</div>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                            <div className="font-semibold text-gray-900">2) Webhook URL</div>
                            <div className="text-gray-600 mt-1">Reveal tokens → Copy URL → paste into provider dashboard.</div>
                        </div>
                        <div className="p-3 rounded-lg bg-gray-50 border border-gray-200">
                            <div className="font-semibold text-gray-900">3) Secrets later</div>
                            <div className="text-gray-600 mt-1">Set `credentialsRef` + env secrets on BFF, then activate in a separate step.</div>
                        </div>
                    </div>
                    <div className="mt-4 text-xs text-gray-500">
                        Provider notes: Monobank requires “Refresh pubkey” after token + `credentialsRef` are set. LiqPay requires `liqpay.*` config fields.
                    </div>
                </div>

                {(error || rotateError || monobankRefreshError || editError) && (
                    <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg">
                        {error || rotateError || monobankRefreshError || editError}
                        <button
                            onClick={loadProviders}
                            className="ml-4 text-sm underline hover:no-underline"
                        >
                            Retry
                        </button>
                    </div>
                )}

                {monobankRefreshedProviderId && (
                    <div className="mb-4 p-4 bg-green-50 text-green-800 rounded-lg border border-green-200">
                        Monobank pubkey refreshed for provider{' '}
                        <span className="font-mono text-xs">{monobankRefreshedProviderId}</span>
                    </div>
                )}

                {latestNewToken && (
                    <div className="mb-4 p-4 bg-amber-50 text-amber-900 rounded-lg border border-amber-200">
                        <div className="font-semibold mb-2">New webhook token generated (copy now)</div>
                        <div className="flex flex-col md:flex-row md:items-center gap-3">
                            <code className="px-3 py-2 bg-white border rounded-lg font-mono text-sm break-all">
                                {latestNewToken.token}
                            </code>
                            <div className="flex gap-2">
                                <button
                                    onClick={async () => {
                                        try {
                                            await navigator.clipboard.writeText(latestNewToken.token);
                                        } catch {
                                            // ignore
                                        }
                                    }}
                                    className="px-3 py-2 bg-gray-900 text-white rounded-lg hover:bg-black transition font-semibold text-sm"
                                >
                                    Copy
                                </button>
                                <button
                                    onClick={() => setLatestNewToken(null)}
                                    className="px-3 py-2 bg-white border rounded-lg hover:bg-gray-50 transition font-semibold text-sm"
                                >
                                    Dismiss
                                </button>
                            </div>
                        </div>
                        <div className="mt-2 text-sm text-amber-800">
                            This token is shown only in your browser state. Treat it like a secret.
                        </div>
                    </div>
                )}

                <div className="mb-6 flex flex-col md:flex-row gap-3 md:items-center">
                    {!showAddForm ? (
                        <button
                            onClick={() => {
                                setFormError('');
                                setShowAddForm(true);
                            }}
                            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition font-semibold"
                        >
                            + Add Provider
                        </button>
                    ) : (
                        <button
                            onClick={() => setShowAddForm(false)}
                            className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-900 transition font-semibold"
                        >
                            ✕ Close
                        </button>
                    )}

                    <label className="inline-flex items-center gap-2 text-sm text-gray-700">
                        <input
                            type="checkbox"
                            checked={keepPreviousTokenOnRotate}
                            onChange={(e) => setKeepPreviousTokenOnRotate(e.target.checked)}
                            className="w-4 h-4"
                        />
                        Keep previous token on rotation (recommended)
                    </label>

                    <button
                        onClick={loadProviders}
                        className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-semibold"
                    >
                        Refresh
                    </button>
                </div>

                {showAddForm && (
                    <div className="mb-6 p-6 bg-white rounded-lg shadow-lg border border-gray-200">
                        <h3 className="text-xl font-bold mb-4">Create Payment Provider</h3>
                        {formError && (
                            <div className="mb-4 p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                                {formError}
                            </div>
                        )}

                        <form onSubmit={handleCreate}>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Type</label>
                                    <select
                                        value={formData.type}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, type: e.target.value as CreateProviderForm['type'] }))}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="MOLLIE">MOLLIE</option>
                                        <option value="MONOBANK">MONOBANK</option>
                                        <option value="LIQPAY">LIQPAY</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Mode</label>
                                    <select
                                        value={formData.mode}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, mode: e.target.value as CreateProviderForm['mode'] }))}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="TEST">TEST</option>
                                        <option value="LIVE">LIVE</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">Status</label>
                                    <select
                                        value={formData.status}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, status: e.target.value as CreateProviderForm['status'] }))}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                                    >
                                        <option value="DISABLED">DISABLED</option>
                                    </select>
                                    <div className="mt-1 text-xs text-gray-500">
                                        Activation is intentionally disabled in UI (safe-mode).
                                    </div>
                                </div>
                                <div>
                                    <label className="block text-sm font-semibold mb-1">credentialsRef (env var name)</label>
                                    <input
                                        type="text"
                                        value={formData.credentialsRef}
                                        onChange={(e) => setFormData((prev) => ({ ...prev, credentialsRef: e.target.value }))}
                                        placeholder="e.g. MONOBANK_TOKEN__TENANT_X__TEST"
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    />
                                    <div className="mt-1 text-xs text-gray-500">
                                        Required only for ACTIVE MOLLIE/MONOBANK.
                                    </div>
                                </div>

                                <div className="md:col-span-2">
                                    <label className="block text-sm font-semibold mb-1">Webhook token</label>
                                    <div className="flex flex-col md:flex-row gap-2">
                                        <input
                                            type="text"
                                            value={formData.webhookToken}
                                            onChange={(e) => setFormData((prev) => ({ ...prev, webhookToken: e.target.value }))}
                                            className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            required
                                        />
                                        <button
                                            type="button"
                                            onClick={() => setFormData((prev) => ({ ...prev, webhookToken: generateWebhookToken() }))}
                                            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-semibold"
                                        >
                                            Regenerate
                                        </button>
                                    </div>
                                </div>

                                {liqpayFieldsVisible && (
                                    <>
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">LiqPay publicKey</label>
                                            <input
                                                type="text"
                                                value={formData.liqpayPublicKey}
                                                onChange={(e) => setFormData((prev) => ({ ...prev, liqpayPublicKey: e.target.value }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">LiqPay currentSecretRef</label>
                                            <input
                                                type="text"
                                                value={formData.liqpayCurrentSecretRef}
                                                onChange={(e) => setFormData((prev) => ({ ...prev, liqpayCurrentSecretRef: e.target.value }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                                required
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">LiqPay previousSecretRef (optional)</label>
                                            <input
                                                type="text"
                                                value={formData.liqpayPreviousSecretRef}
                                                onChange={(e) => setFormData((prev) => ({ ...prev, liqpayPreviousSecretRef: e.target.value }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">previousValidUntil (optional ISO date)</label>
                                            <input
                                                type="text"
                                                value={formData.liqpayPreviousValidUntil}
                                                onChange={(e) => setFormData((prev) => ({ ...prev, liqpayPreviousValidUntil: e.target.value }))}
                                                placeholder="2026-01-15T00:00:00Z"
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">signatureOutAlgorithm</label>
                                            <select
                                                value={formData.liqpaySignatureOutAlgorithm}
                                                onChange={(e) => setFormData((prev) => ({ ...prev, liqpaySignatureOutAlgorithm: e.target.value as CreateProviderForm['liqpaySignatureOutAlgorithm'] }))}
                                                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                            >
                                                <option value="sha1">sha1</option>
                                                <option value="sha3-256">sha3-256</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="block text-sm font-semibold mb-1">signatureInAlgorithms</label>
                                            <div className="flex gap-4 text-sm">
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.liqpaySignatureInAlgorithms.includes('sha1')}
                                                        onChange={(e) => {
                                                            setFormData((prev) => {
                                                                const next = new Set(prev.liqpaySignatureInAlgorithms);
                                                                if (e.target.checked) next.add('sha1');
                                                                else next.delete('sha1');
                                                                return { ...prev, liqpaySignatureInAlgorithms: Array.from(next) as CreateProviderForm['liqpaySignatureInAlgorithms'] };
                                                            });
                                                        }}
                                                        className="w-4 h-4"
                                                    />
                                                    sha1
                                                </label>
                                                <label className="inline-flex items-center gap-2">
                                                    <input
                                                        type="checkbox"
                                                        checked={formData.liqpaySignatureInAlgorithms.includes('sha3-256')}
                                                        onChange={(e) => {
                                                            setFormData((prev) => {
                                                                const next = new Set(prev.liqpaySignatureInAlgorithms);
                                                                if (e.target.checked) next.add('sha3-256');
                                                                else next.delete('sha3-256');
                                                                return { ...prev, liqpaySignatureInAlgorithms: Array.from(next) as CreateProviderForm['liqpaySignatureInAlgorithms'] };
                                                            });
                                                        }}
                                                        className="w-4 h-4"
                                                    />
                                                    sha3-256
                                                </label>
                                            </div>
                                            <div className="mt-1 text-xs text-gray-500">
                                                At least one algorithm must be selected.
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="mt-6 flex gap-3">
                                <button
                                    type="submit"
                                    disabled={submitting}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50"
                                >
                                    {submitting ? 'Creating…' : 'Create Provider'}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setShowAddForm(false)}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-semibold"
                                >
                                    Cancel
                                </button>
                            </div>
                        </form>
                    </div>
                )}

                {loading ? (
                    <div className="bg-white rounded-lg shadow p-12 text-center">
                        <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
                        <p className="text-gray-500">Loading payment providers...</p>
                    </div>
                ) : (
                    <div className="bg-white rounded-xl shadow-lg overflow-hidden border border-gray-200">
                        <div className="overflow-x-auto">
                            <table className="w-full">
                                <thead className="bg-gray-50 border-b border-gray-200">
                                    <tr>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Type</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Mode</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Status</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">credentialsRef</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Webhook Tokens</th>
                                        <th className="px-6 py-4 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Go-live</th>
                                        <th className="px-6 py-4 text-center text-xs font-semibold text-gray-600 uppercase tracking-wider">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-200">
                                    {sortedProviders.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                                                No payment providers found for this tenant.
                                            </td>
                                        </tr>
                                    ) : (
                                        sortedProviders.map((p) => {
                                            const tokens = extractWebhookTokens(p.config);
                                            const revealed = !!revealedProviderIds[p.id];
                                            const readiness = computeReadiness(p);
                                            const showChecklist = !!expandedChecklistProviderIds[p.id];
                                            const validTokens = tokens.filter(isValidWebhookToken);
                                            const monobankPubkeys = p.type === 'MONOBANK' ? getMonobankPubkeyCount(p.config) : 0;
                                            const liqpaySecretRefs = p.type === 'LIQPAY' ? getLiqpaySecretRefs(p.config) : null;
                                            return (
                                                <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                                                    <td className="px-6 py-4">
                                                        <div className="font-semibold text-gray-900">{p.type}</div>
                                                        <div className="text-xs text-gray-500 font-mono">{p.id}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-blue-100 text-blue-800">
                                                            {p.mode}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {p.status === 'ACTIVE' ? (
                                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800">
                                                                ACTIVE
                                                            </span>
                                                        ) : (
                                                            <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-gray-100 text-gray-700">
                                                                DISABLED
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {p.credentialsRef ? (
                                                            <code className="text-xs font-mono bg-gray-100 px-2 py-1 rounded border border-gray-200 break-all">
                                                                {p.credentialsRef}
                                                            </code>
                                                        ) : (
                                                            <span className="text-gray-400 text-sm">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-sm text-gray-700">
                                                                {tokens.length} token{tokens.length === 1 ? '' : 's'}
                                                            </span>
                                                            <button
                                                                onClick={() => toggleReveal(p.id)}
                                                                className="text-xs underline text-blue-700 hover:text-blue-900"
                                                            >
                                                                {revealed ? 'Hide' : 'Reveal'}
                                                            </button>
                                                        </div>
                                                        {revealed && (
                                                            <div className="mt-2 space-y-2">
                                                                {tokens.length === 0 ? (
                                                                    <div className="text-xs text-gray-400">No tokens in config</div>
                                                                ) : (
                                                                    tokens.map((t, idx) => {
                                                                        const key = `${p.id}:${idx}`;
                                                                        return (
                                                                            <div key={key} className="flex items-center gap-2">
                                                                                <code className="flex-1 text-xs font-mono bg-white px-2 py-1 rounded border border-gray-200 break-all">
                                                                                    {t}
                                                                                </code>
                                                                                <button
                                                                                    onClick={() => handleCopyWebhookUrl(p, t, idx)}
                                                                                    className="px-2 py-1 text-xs bg-white border border-gray-300 rounded hover:bg-gray-50 font-semibold"
                                                                                    title="Copy full webhook URL (includes token)"
                                                                                >
                                                                                    {copiedWebhookKey === key ? 'Copied' : 'Copy URL'}
                                                                                </button>
                                                                            </div>
                                                                        );
                                                                    })
                                                                )}
                                                                {p.updatedAt && (
                                                                    <div className="text-xs text-gray-500">
                                                                        Updated: {formatIsoDateShort(p.updatedAt)}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex flex-col gap-2">
                                                            {readiness.level === 'READY' ? (
                                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-green-100 text-green-800 w-fit">
                                                                    READY
                                                                </span>
                                                            ) : (
                                                                <span className="inline-flex items-center px-2 py-1 rounded text-xs font-semibold bg-amber-100 text-amber-900 w-fit">
                                                                    NOT READY
                                                                </span>
                                                            )}
                                                            <button
                                                                onClick={() => toggleChecklist(p.id)}
                                                                className="text-xs underline text-slate-900 hover:text-black w-fit"
                                                                title="Shows what secrets/steps are required before manual activation"
                                                            >
                                                                {showChecklist ? 'Hide checklist' : 'Show checklist'}
                                                            </button>
                                                            {readiness.issues.length > 0 && (
                                                                <ul className="text-xs text-gray-700 list-disc pl-4 space-y-1">
                                                                    {readiness.issues.slice(0, 4).map((it) => (
                                                                        <li key={it}>{it}</li>
                                                                    ))}
                                                                </ul>
                                                            )}
                                                            {readiness.hints.length > 0 && (
                                                                <div className="text-[11px] text-gray-500">
                                                                    {readiness.hints[0]}
                                                                </div>
                                                            )}

                                                            {showChecklist && (
                                                                <div className="mt-1 p-3 bg-white border border-gray-200 rounded-lg text-xs text-gray-700 space-y-2">
                                                                    <div>
                                                                        <div className="font-semibold text-gray-900">Secrets (Fly / `vendora-bff`)</div>
                                                                        {p.type === 'LIQPAY' ? (
                                                                            <ul className="list-disc pl-4 mt-1 space-y-1">
                                                                                <li>
                                                                                    `liqpay.currentSecretRef`:{" "}
                                                                                    {liqpaySecretRefs?.currentSecretRef ? (
                                                                                        <span className="font-mono">{liqpaySecretRefs.currentSecretRef}</span>
                                                                                    ) : (
                                                                                        <span className="text-amber-900">missing</span>
                                                                                    )}
                                                                                </li>
                                                                                {liqpaySecretRefs?.previousSecretRef && (
                                                                                    <li>
                                                                                        `liqpay.previousSecretRef`:{" "}
                                                                                        <span className="font-mono">{liqpaySecretRefs.previousSecretRef}</span>
                                                                                        {liqpaySecretRefs.previousValidUntil ? (
                                                                                            <span className="text-gray-500">
                                                                                                {" "}
                                                                                                (until {formatIsoDateShort(liqpaySecretRefs.previousValidUntil)})
                                                                                            </span>
                                                                                        ) : null}
                                                                                    </li>
                                                                                )}
                                                                                <li className="text-gray-500">Never store private keys in DB config.</li>
                                                                            </ul>
                                                                        ) : (
                                                                            <ul className="list-disc pl-4 mt-1 space-y-1">
                                                                                <li>
                                                                                    `credentialsRef`:{" "}
                                                                                    {p.credentialsRef ? (
                                                                                        <span className="font-mono">{p.credentialsRef}</span>
                                                                                    ) : (
                                                                                        <span className="text-amber-900">set credentialsRef first</span>
                                                                                    )}
                                                                                </li>
                                                                            </ul>
                                                                        )}
                                                                    </div>

                                                                    {p.type === 'MONOBANK' && (
                                                                        <div>
                                                                            <div className="font-semibold text-gray-900">Monobank prerequisite</div>
                                                                            <div className="mt-1 text-gray-700">
                                                                                Public keys in DB: <span className="font-mono">{String(monobankPubkeys)}</span> (use “Refresh pubkey” after secrets are set)
                                                                            </div>
                                                                        </div>
                                                                    )}

                                                                    <div>
                                                                        <div className="font-semibold text-gray-900">Webhook URL</div>
                                                                        <div className="mt-1 text-gray-700">
                                                                            Use “Reveal” → “Copy URL”. Token count (valid):{" "}
                                                                            <span className="font-mono">{String(validTokens.length)}</span>
                                                                        </div>
                                                                    </div>

                                                                    <div>
                                                                        <div className="font-semibold text-gray-900">Manual activation (not in UI)</div>
                                                                        <div className="mt-1 text-gray-700">
                                                                            Endpoint:{" "}
                                                                            <span className="font-mono break-all">
                                                                                PATCH /super/tenants/{tenantId}/payment-providers/{p.id}
                                                                            </span>{" "}
                                                                            with body <span className="font-mono">{`{"status":"ACTIVE"}`}</span>.
                                                                        </div>
                                                                        <div className="mt-1 text-gray-500">
                                                                            Must be executed by SUPER_ADMIN and only after secrets are present. Keep activation as a separate, deliberate step.
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <div className="flex justify-center gap-2">
                                                            <button
                                                                onClick={() => handleRotateToken(p.id)}
                                                                className="px-3 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-gray-900 text-white hover:bg-black"
                                                                title="Generate a new webhook token (copy it immediately)"
                                                            >
                                                                Rotate token
                                                            </button>
                                                            {p.type === 'MONOBANK' && (
                                                                <button
                                                                    onClick={() => handleRefreshMonobankPubkey(p.id)}
                                                                    className="px-3 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-blue-600 text-white hover:bg-blue-700"
                                                                    title="Fetch current Monobank webhook public key using credentialsRef"
                                                                >
                                                                    Refresh pubkey
                                                                </button>
                                                            )}
                                                            <button
                                                                onClick={() => openEdit(p)}
                                                                className="px-3 py-2 rounded-lg font-semibold text-sm transition-all shadow-sm hover:shadow-md bg-white border border-gray-300 hover:bg-gray-50"
                                                                title="Edit DISABLED provider config (safe mode)"
                                                            >
                                                                Edit
                                                            </button>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )}
            </div>

            {editingProvider && (
                <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
                    <div className="w-full max-w-2xl bg-white rounded-xl shadow-xl border border-gray-200">
                        <div className="p-6 border-b border-gray-200 flex items-start justify-between gap-4">
                            <div>
                                <div className="text-lg font-bold text-gray-900">Edit Payment Provider</div>
                                <div className="text-xs text-gray-500 font-mono mt-1">{editingProvider.id}</div>
                                <div className="text-sm text-gray-700 mt-2">
                                    {editingProvider.type} · {editingProvider.mode} · <span className="font-semibold">FORCED DISABLED</span>
                                </div>
                            </div>
                            <button
                                onClick={closeEdit}
                                className="px-3 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 font-semibold"
                            >
                                ✕
                            </button>
                        </div>

                        <form onSubmit={handleSaveEdit} className="p-6">
                            <div className="grid grid-cols-1 gap-4">
                                <div>
                                    <label className="block text-sm font-semibold mb-1">credentialsRef (env var name)</label>
                                    <input
                                        type="text"
                                        value={editCredentialsRef}
                                        onChange={(e) => setEditCredentialsRef(e.target.value)}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                        placeholder="Optional while DISABLED"
                                    />
                                    <div className="mt-1 text-xs text-gray-500">
                                        This UI keeps providers DISABLED to avoid accidental activation.
                                    </div>
                                </div>

                                <div>
                                    <label className="block text-sm font-semibold mb-1">Webhook tokens (one per line)</label>
                                    <textarea
                                        value={editWebhookTokensText}
                                        onChange={(e) => setEditWebhookTokensText(e.target.value)}
                                        rows={6}
                                        className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                                    />
                                    <div className="mt-1 text-xs text-gray-500">
                                        Keep 1–2 tokens. Rotation will also maintain up to 2 tokens.
                                    </div>
                                </div>
                            </div>

                            <div className="mt-6 flex gap-3">
                                <button
                                    type="submit"
                                    disabled={editSubmitting}
                                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition font-semibold disabled:opacity-50"
                                >
                                    {editSubmitting ? 'Saving…' : 'Save'}
                                </button>
                                <button
                                    type="button"
                                    onClick={closeEdit}
                                    className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition font-semibold"
                                >
                                    Cancel
                                </button>
                                {editError && (
                                    <div className="ml-auto text-sm text-red-700 self-center">
                                        {editError}
                                    </div>
                                )}
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
