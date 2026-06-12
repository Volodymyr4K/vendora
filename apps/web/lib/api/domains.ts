import { fetchClient } from "./fetchClient";

export async function verifyDomain(tenantId: string, domainId: string) {
    const res = await fetchClient(`/api/super-admin/tenants/${tenantId}/domains/${domainId}/verify`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    });

    if (!res.ok) {
        throw new Error('Failed to verify domain');
    }

    return res.json();
}

export async function deleteDomain(tenantId: string, domainId: string) {
    const res = await fetchClient(`/api/super-admin/tenants/${tenantId}/domains/${domainId}`, {
        method: 'DELETE'
    });

    if (!res.ok) {
        throw new Error('Failed to delete domain');
    }

    return res.json();
}
