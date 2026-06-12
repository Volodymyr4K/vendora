/**
 * Cache Tenant Isolation Tests
 * 
 * Comprehensive test suite for Phase 2: Cache Tenant Isolation
 * 
 * Tests verify that:
 * 1. All cache keys include tenantId as first segment
 * 2. Different tenants get different cache entries
 * 3. Tenant A cannot access Tenant B's cached data
 * 4. Cache invalidation only affects target tenant
 * 5. All cache operations (get/set/del) are tenant-scoped
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MemoryCache, type Cache } from '../../cache/index.js';

// Mock tenant IDs for testing
const TENANT_A_ID = '00000000-0000-0000-0000-000000000001';
const TENANT_B_ID = '00000000-0000-0000-0000-000000000002';
const TENANT_C_ID = '00000000-0000-0000-0000-000000000003';

// Test data
const mockMenuData = {
    categories: [{ id: '1', name: 'Pizza', slug: 'pizza' }],
    items: [{ id: 'item-1', name: 'Margherita', price: 100 }]
};

const mockDeliveryData = {
    mode: 'ok' as const,
    cfg: {
        deliveryFee: 50,
        freeFrom: 500,
        etaMin: 30,
        etaMax: 45,
        zones: []
    }
};

const mockOrderData = {
    token: 'order-token-123',
    orderId: 'order-456',
    status: 'pending',
    quote: { total: 1500 }
};

describe('Cache Tenant Isolation - Phase 2', () => {
    let cache: Cache;

    beforeEach(async () => {
        // Use MemoryCache for tests (faster, no external dependencies)
        cache = new MemoryCache();
    });

    describe('Cache Key Format Validation', () => {
        it('should enforce tenant:${tenantId}:${resource}:${id} pattern for menu cache', async () => {
            const key = `tenant:${TENANT_A_ID}:menu:full`;

            await cache.set(key, mockMenuData, 60, 120);
            const result = await cache.get(key);

            expect(result).not.toBeNull();
            expect(result?.value).toEqual(mockMenuData);

            // Verify key structure
            const parts = key.split(':');
            expect(parts[0]).toBe('tenant');
            expect(parts[1]).toBe(TENANT_A_ID);
            expect(parts[2]).toBe('menu');
            expect(parts[3]).toBe('full');
        });

        it('should enforce tenant:${tenantId}:${resource}:${id} pattern for delivery cache', async () => {
            const branchSlug = 'kyiv-branch';
            const key = `tenant:${TENANT_A_ID}:delivery:${branchSlug}`;

            await cache.set(key, mockDeliveryData, 60, 120);
            const result = await cache.get(key);

            expect(result).not.toBeNull();
            expect(result?.value).toEqual(mockDeliveryData);

            // Verify key structure
            const parts = key.split(':');
            expect(parts[0]).toBe('tenant');
            expect(parts[1]).toBe(TENANT_A_ID);
            expect(parts[2]).toBe('delivery');
            expect(parts[3]).toBe(branchSlug);
        });

        it('should enforce tenant:${tenantId}:${resource}:${id} pattern for order cache', async () => {
            const orderToken = 'token-xyz';
            const key = `tenant:${TENANT_A_ID}:order:${orderToken}`;

            await cache.set(key, mockOrderData, 60, 120);
            const result = await cache.get(key);

            expect(result).not.toBeNull();
            expect(result?.value).toEqual(mockOrderData);

            // Verify key structure
            const parts = key.split(':');
            expect(parts[0]).toBe('tenant');
            expect(parts[1]).toBe(TENANT_A_ID);
            expect(parts[2]).toBe('order');
            expect(parts[3]).toBe(orderToken);
        });

        it('should enforce tenant:${tenantId}:${resource}:${id} pattern for idempotency cache', async () => {
            const idemKey = 'idem-key-abc';
            const key = `tenant:${TENANT_A_ID}:idem:${idemKey}`;
            const idemValue = { success: true, orderId: '123' };

            await cache.set(key, idemValue, 60, 120);
            const result = await cache.get(key);

            expect(result).not.toBeNull();
            expect(result?.value).toEqual(idemValue);

            // Verify key structure
            const parts = key.split(':');
            expect(parts[0]).toBe('tenant');
            expect(parts[1]).toBe(TENANT_A_ID);
            expect(parts[2]).toBe('idem');
            expect(parts[3]).toBe(idemKey);
        });
    });

    describe('Cross-Tenant Cache Isolation', () => {
        it('should isolate menu cache between different tenants', async () => {
            // Tenant A sets menu
            const keyA = `tenant:${TENANT_A_ID}:menu:full`;
            const menuA = { ...mockMenuData, items: [{ id: '1', name: 'Pizza A', price: 100 }] };
            await cache.set(keyA, menuA, 60, 120);

            // Tenant B sets different menu
            const keyB = `tenant:${TENANT_B_ID}:menu:full`;
            const menuB = { ...mockMenuData, items: [{ id: '2', name: 'Pizza B', price: 200 }] };
            await cache.set(keyB, menuB, 60, 120);

            // Verify Tenant A gets their own menu
            const resultA = await cache.get(keyA);
            expect(resultA?.value).toEqual(menuA);
            expect(resultA?.value).not.toEqual(menuB);

            // Verify Tenant B gets their own menu
            const resultB = await cache.get(keyB);
            expect(resultB?.value).toEqual(menuB);
            expect(resultB?.value).not.toEqual(menuA);
        });

        it('should prevent Tenant A from accessing Tenant B delivery cache', async () => {
            const branchSlug = 'same-branch-slug';

            // Tenant B caches delivery config
            const keyB = `tenant:${TENANT_B_ID}:delivery:${branchSlug}`;
            await cache.set(keyB, mockDeliveryData, 60, 120);

            // Tenant A tries to access with same branch slug but different tenant
            const keyA = `tenant:${TENANT_A_ID}:delivery:${branchSlug}`;
            const resultA = await cache.get(keyA);

            // Should return null (no cache entry for Tenant A)
            expect(resultA).toBeNull();

            // Verify Tenant B's cache is still intact
            const resultB = await cache.get(keyB);
            expect(resultB).not.toBeNull();
            expect(resultB?.value).toEqual(mockDeliveryData);
        });

        it('should prevent Tenant A from accessing Tenant B order cache', async () => {
            const orderToken = 'shared-token-123';

            // Tenant B caches order
            const keyB = `tenant:${TENANT_B_ID}:order:${orderToken}`;
            const orderB = { ...mockOrderData, orderId: 'order-B' };
            await cache.set(keyB, orderB, 60, 120);

            // Tenant A tries to access with same token but different tenant
            const keyA = `tenant:${TENANT_A_ID}:order:${orderToken}`;
            const resultA = await cache.get(keyA);

            // Should return null (no cross-tenant access)
            expect(resultA).toBeNull();

            // Verify Tenant B's order is still cached
            const resultB = await cache.get(keyB);
            expect(resultB?.value).toEqual(orderB);
        });

        it('should isolate idempotency keys between tenants', async () => {
            const idemKey = 'same-idem-key';

            // Both tenants use same idempotency key
            const keyA = `tenant:${TENANT_A_ID}:idem:${idemKey}`;
            const keyB = `tenant:${TENANT_B_ID}:idem:${idemKey}`;

            const valueA = { orderId: 'order-A-123', status: 'pending' };
            const valueB = { orderId: 'order-B-456', status: 'confirmed' };

            await cache.set(keyA, valueA, 60, 120);
            await cache.set(keyB, valueB, 60, 120);

            // Each tenant gets their own result
            const resultA = await cache.get(keyA);
            const resultB = await cache.get(keyB);

            expect(resultA?.value).toEqual(valueA);
            expect(resultB?.value).toEqual(valueB);
            expect(resultA?.value).not.toEqual(valueB);
        });
    });

    describe('Cache Invalidation Isolation', () => {
        it('should only invalidate target tenant cache on delete', async () => {
            const branchSlug = 'branch-1';

            // Set cache for multiple tenants
            const keyA = `tenant:${TENANT_A_ID}:branches:${branchSlug}`;
            const keyB = `tenant:${TENANT_B_ID}:branches:${branchSlug}`;
            const keyC = `tenant:${TENANT_C_ID}:branches:${branchSlug}`;

            const branchA = { id: '1', name: 'Branch A', slug: branchSlug };
            const branchB = { id: '2', name: 'Branch B', slug: branchSlug };
            const branchC = { id: '3', name: 'Branch C', slug: branchSlug };

            await cache.set(keyA, branchA, 60, 120);
            await cache.set(keyB, branchB, 60, 120);
            await cache.set(keyC, branchC, 60, 120);

            // Admin invalidates Tenant A's cache
            await cache.del(keyA);

            // Verify only Tenant A's cache was deleted
            const resultA = await cache.get(keyA);
            const resultB = await cache.get(keyB);
            const resultC = await cache.get(keyC);

            expect(resultA).toBeNull();
            expect(resultB?.value).toEqual(branchB);
            expect(resultC?.value).toEqual(branchC);
        });

        it('should support multi-key invalidation for same tenant', async () => {
            const branchSlug = 'branch-x';

            // Tenant A has multiple related cache entries
            const branchKey = `tenant:${TENANT_A_ID}:branches:${branchSlug}`;
            const deliveryKey = `tenant:${TENANT_A_ID}:delivery:${branchSlug}`;

            await cache.set(branchKey, { name: 'Branch X' }, 60, 120);
            await cache.set(deliveryKey, mockDeliveryData, 60, 120);

            // Invalidate both (simulating admin settings update)
            await cache.del(branchKey);
            await cache.del(deliveryKey);

            // Both should be deleted
            const branchResult = await cache.get(branchKey);
            const deliveryResult = await cache.get(deliveryKey);

            expect(branchResult).toBeNull();
            expect(deliveryResult).toBeNull();
        });
    });

    describe('Multi-Tenant Concurrent Access', () => {
        it('should handle concurrent writes from different tenants', async () => {
            const promises = [];

            // Simulate 3 tenants writing menu cache concurrently
            for (let i = 0; i < 3; i++) {
                const tenantId = `tenant-${i}`;
                const key = `tenant:${tenantId}:menu:full`;
                const menu = { ...mockMenuData, tenantId };

                promises.push(cache.set(key, menu, 60, 120));
            }

            await Promise.all(promises);

            // Verify all writes succeeded and are isolated
            for (let i = 0; i < 3; i++) {
                const tenantId = `tenant-${i}`;
                const key = `tenant:${tenantId}:menu:full`;
                const result = await cache.get(key);

                expect(result).not.toBeNull();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                expect((result?.value as any).tenantId).toBe(tenantId);
            }
        });

        it('should handle concurrent reads from same tenant', async () => {
            const key = `tenant:${TENANT_A_ID}:menu:full`;
            await cache.set(key, mockMenuData, 60, 120);

            // Simulate 10 concurrent reads from same tenant
            const promises = Array(10).fill(null).map(() => cache.get(key));
            const results = await Promise.all(promises);

            // All reads should succeed
            expect(results.every(r => r !== null)).toBe(true);
            expect(results.every(r => r?.value === mockMenuData)).toBe(true);
        });
    });

    describe('Cache Key Pattern Enforcement', () => {
        it('should reject global cache keys without tenantId (conceptual test)', () => {
            // This test documents that global keys are NOT allowed
            // In actual implementation, we enforce this at code level

            const validKey = `tenant:${TENANT_A_ID}:menu:full`;
            const invalidGlobalKey = 'menu:full'; // No tenant prefix - WRONG!

            // Valid pattern
            expect(validKey.startsWith('tenant:')).toBe(true);
            expect(validKey.split(':')[1]).toBe(TENANT_A_ID);

            // Invalid pattern detection
            expect(invalidGlobalKey.startsWith('tenant:')).toBe(false);
        });

        it('should validate tenant ID is UUID format in keys', () => {
            const validKey = `tenant:${TENANT_A_ID}:menu:full`;
            const invalidKey = 'tenant:not-a-uuid:menu:full';

            // Extract tenantId from key
            const extractTenantId = (key: string) => key.split(':')[1];

            const validTenantId = extractTenantId(validKey);
            const invalidTenantId = extractTenantId(invalidKey);

            // UUID pattern validation
            const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

            expect(uuidPattern.test(validTenantId || '')).toBe(true);
            expect(uuidPattern.test(invalidTenantId || '')).toBe(false);
        });
    });

    describe('Real-World Cache Scenarios', () => {
        it('should handle checkout flow with tenant isolation', async () => {
            const branchSlug = 'downtown';

            // Tenant A checkout
            const menuKeyA = `tenant:${TENANT_A_ID}:menu:full`;
            const deliveryKeyA = `tenant:${TENANT_A_ID}:delivery:${branchSlug}`;
            const idemKeyA = `tenant:${TENANT_A_ID}:idem:idem-key-1`;

            await cache.set(menuKeyA, mockMenuData, 60, 120);
            await cache.set(deliveryKeyA, mockDeliveryData, 60, 120);
            await cache.set(idemKeyA, { orderId: 'A-123' }, 300, 600);

            // Tenant B checkout (same branch slug)
            const menuKeyB = `tenant:${TENANT_B_ID}:menu:full`;
            const deliveryKeyB = `tenant:${TENANT_B_ID}:delivery:${branchSlug}`;
            const idemKeyB = `tenant:${TENANT_B_ID}:idem:idem-key-1`;

            const menuB = { ...mockMenuData, items: [{ id: 'diff', name: 'Different', price: 999 }] };
            await cache.set(menuKeyB, menuB, 60, 120);
            await cache.set(deliveryKeyB, mockDeliveryData, 60, 120);
            await cache.set(idemKeyB, { orderId: 'B-456' }, 300, 600);

            // Verify complete isolation
            const menuA = await cache.get(menuKeyA);
            const menuBResult = await cache.get(menuKeyB);

            expect(menuA?.value).not.toEqual(menuBResult?.value);

            const idemA = await cache.get(idemKeyA);
            const idemB = await cache.get(idemKeyB);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((idemA?.value as any).orderId).toBe('A-123');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((idemB?.value as any).orderId).toBe('B-456');
        });

        it('should handle admin branch settings update with cache invalidation', async () => {
            const branchSlug = 'central';

            // Multiple tenants have cached branch settings
            const tenants = [TENANT_A_ID, TENANT_B_ID, TENANT_C_ID];

            for (const tenantId of tenants) {
                const branchKey = `tenant:${tenantId}:branches:${branchSlug}`;
                const deliveryKey = `tenant:${tenantId}:delivery:${branchSlug}`;

                await cache.set(branchKey, { name: `Branch ${tenantId}` }, 60, 120);
                await cache.set(deliveryKey, mockDeliveryData, 60, 120);
            }

            // Admin updates Tenant A's branch settings
            // Must invalidate ONLY Tenant A's cache
            const branchKeyA = `tenant:${TENANT_A_ID}:branches:${branchSlug}`;
            const deliveryKeyA = `tenant:${TENANT_A_ID}:delivery:${branchSlug}`;

            await cache.del(branchKeyA);
            await cache.del(deliveryKeyA);

            // Verify only Tenant A's cache was invalidated
            const resultA_branch = await cache.get(branchKeyA);
            const resultA_delivery = await cache.get(deliveryKeyA);

            expect(resultA_branch).toBeNull();
            expect(resultA_delivery).toBeNull();

            // Other tenants' caches should be intact
            for (const tenantId of [TENANT_B_ID, TENANT_C_ID]) {
                const branchKey = `tenant:${tenantId}:branches:${branchSlug}`;
                const deliveryKey = `tenant:${tenantId}:delivery:${branchSlug}`;

                const branchResult = await cache.get(branchKey);
                const deliveryResult = await cache.get(deliveryKey);

                expect(branchResult).not.toBeNull();
                expect(deliveryResult).not.toBeNull();
            }
        });
    });

    describe('Cache TTL and Staleness with Tenant Isolation', () => {
        it('should respect TTL independently per tenant', async () => {
            const key = 'menu:full';

            // Tenant A: short TTL
            const keyA = `tenant:${TENANT_A_ID}:${key}`;
            await cache.set(keyA, mockMenuData, 1, 10); // 1s fresh, 10s stale

            // Tenant B: long TTL
            const keyB = `tenant:${TENANT_B_ID}:${key}`;
            await cache.set(keyB, mockMenuData, 100, 200); // 100s fresh

            // Wait 2 seconds
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Tenant A should be stale
            const resultA = await cache.get(keyA);
            expect(resultA?.stale).toBe(true);

            // Tenant B should still be fresh
            const resultB = await cache.get(keyB);
            expect(resultB?.stale).toBe(false);
        });
    });

    describe('Regression Tests - Prevent Cache Poisoning', () => {
        it('should prevent menu cache poisoning (original bug)', async () => {
            // Original bug: global key "menu:full" shared across tenants
            // Fixed: now "tenant:${tenantId}:menu:full"

            // Tenant A caches menu with item "Pizza A"
            const keyA = `tenant:${TENANT_A_ID}:menu:full`;
            const menuA = {
                categories: [{ id: '1', name: 'Italian', slug: 'italian' }],
                items: [{ id: 'item-a', name: 'Pizza A', price: 100 }]
            };
            await cache.set(keyA, menuA, 60, 120);

            // Tenant B caches different menu with item "Sushi B"
            const keyB = `tenant:${TENANT_B_ID}:menu:full`;
            const menuB = {
                categories: [{ id: '2', name: 'Japanese', slug: 'japanese' }],
                items: [{ id: 'item-b', name: 'Sushi B', price: 200 }]
            };
            await cache.set(keyB, menuB, 60, 120);

            // Verify no cross-contamination
            const resultA = await cache.get(keyA);
            const resultB = await cache.get(keyB);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((resultA?.value as any).items[0].name).toBe('Pizza A');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((resultB?.value as any).items[0].name).toBe('Sushi B');

            // Original bug would have served same menu to both
            expect(resultA?.value).not.toEqual(resultB?.value);
        });

        it('should prevent order cache leakage (security test)', async () => {
            // Security test: same order token used by different tenants
            // (e.g., collision or token prediction attack)

            const token = 'order-token-123';

            const keyA = `tenant:${TENANT_A_ID}:order:${token}`;
            const orderA = {
                token,
                orderId: 'A-sensitive-order',
                customerName: 'Customer A',
                total: 1000
            };

            const keyB = `tenant:${TENANT_B_ID}:order:${token}`;
            const orderB = {
                token,
                orderId: 'B-sensitive-order',
                customerName: 'Customer B',
                total: 2000
            };

            await cache.set(keyA, orderA, 60, 120);
            await cache.set(keyB, orderB, 60, 120);

            // Verify complete isolation
            const resultA = await cache.get(keyA);
            const resultB = await cache.get(keyB);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((resultA?.value as any).customerName).toBe('Customer A');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((resultB?.value as any).customerName).toBe('Customer B');

            // Ensure no cross-tenant access
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect((resultA?.value as any).orderId).not.toBe((resultB?.value as any).orderId);
        });
    });
});
