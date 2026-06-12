/**
 * Tenant Context Helper for Server Components
 * 
 * Extracts tenant information from headers injected by middleware
 */

import { headers } from 'next/headers';

export interface TenantContext {
    tenantId: string;
    tenantSlug: string;
    tenantType: 'subdomain' | 'custom';
}

/**
 * Get tenant context from middleware-injected headers
 * 
 * Use in Server Components to access tenant information
 * without additional database queries
 * 
 * @example
 * ```tsx
 * export default async function MenuPage() {
 *   const { tenantId } = await getTenantContext();
 *   const products = await prisma.product.findMany({ where: { tenantId } });
 *   return <ProductList products={products} />;
 * }
 * ```
 */
export async function getTenantContext(): Promise<TenantContext> {
    const headersList = await headers();

    const tenantId = headersList.get('x-tenant-id');
    const tenantSlug = headersList.get('x-tenant-slug');
    const tenantType = headersList.get('x-tenant-type') as 'subdomain' | 'custom' | null;

    if (!tenantId || !tenantSlug || !tenantType) {
        throw new Error('Tenant context not available. Ensure middleware is configured correctly.');
    }

    return {
        tenantId,
        tenantSlug,
        tenantType
    };
}
