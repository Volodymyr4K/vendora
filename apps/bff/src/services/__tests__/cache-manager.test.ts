import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CacheManager, type CachedTenant } from '../cache-manager.js';
import { DEFAULT_RESOLVED_THEME } from '../theme.js';

describe('CacheManager', () => {
    let cache: CacheManager;

    // Mock tenant data (theme required per CachedTenant; audit 3.4)
    const mockTenant: CachedTenant = {
        id: 'tenant-123',
        slug: 'vendora',
        name: 'Vendora Sushi',
        isActive: true,
        customDomainsEnabled: true,
        countryCode: 'UA',
        currency: 'UAH',
        timezone: 'Europe/Kiev',
        theme: DEFAULT_RESOLVED_THEME,
        customDomains: [
            { domain: 'example.com', status: 'VERIFIED' }
        ]
    };

    beforeEach(() => {
        // Create fresh cache instance for each test
        cache = new CacheManager({
            l1Max: 100,
            l1Ttl: 1000, // 1 second for testing
            l2Max: 50,
            l2Ttl: 2000  // 2 seconds for testing
        });
    });

    describe('L1: Domain → TenantId Mapping', () => {
        it('should set and get tenant ID for domain', () => {
            cache.setTenantId('vendora.vendora.local', 'tenant-123');

            const tenantId = cache.getTenantId('vendora.vendora.local');
            expect(tenantId).toBe('tenant-123');
        });

        it('should return undefined for missing domain', () => {
            const tenantId = cache.getTenantId('nonexistent.vendora.local');
            expect(tenantId).toBeUndefined();
        });

        it('should support both subdomains and custom domains', () => {
            cache.setTenantId('vendora.vendora.local', 'tenant-123');
            cache.setTenantId('example.com', 'tenant-456');

            expect(cache.getTenantId('vendora.vendora.local')).toBe('tenant-123');
            expect(cache.getTenantId('example.com')).toBe('tenant-456');
        });

        it('should overwrite existing mapping', () => {
            cache.setTenantId('domain.com', 'tenant-old');
            cache.setTenantId('domain.com', 'tenant-new');

            expect(cache.getTenantId('domain.com')).toBe('tenant-new');
        });
    });

    describe('L2: TenantId → Tenant Data', () => {
        it('should set and get tenant data', () => {
            cache.setTenant('tenant-123', mockTenant);

            const tenant = cache.getTenant('tenant-123');
            expect(tenant).toEqual(mockTenant);
        });

        it('should return undefined for missing tenant', () => {
            const tenant = cache.getTenant('nonexistent-id');
            expect(tenant).toBeUndefined();
        });

        it('should store complete tenant object', () => {
            cache.setTenant('tenant-123', mockTenant);

            const tenant = cache.getTenant('tenant-123');
            expect(tenant?.slug).toBe('vendora');
            expect(tenant?.customDomains).toHaveLength(1);
            expect(tenant?.customDomains?.[0]?.domain).toBe('example.com');
        });
    });

    describe('Invalidation: Lazy vs Aggressive', () => {
        it('should only clear L2 when invalidating tenant (lazy invalidation)', () => {
            // Setup both L1 and L2
            cache.setTenantId('vendora.vendora.local', 'tenant-123');
            cache.setTenant('tenant-123', mockTenant);

            // Verify cached
            expect(cache.getTenantId('vendora.vendora.local')).toBe('tenant-123');
            expect(cache.getTenant('tenant-123')).toEqual(mockTenant);

            // Invalidate tenant (L2 only)
            cache.invalidateTenant('tenant-123');

            // L1 should still exist
            expect(cache.getTenantId('vendora.vendora.local')).toBe('tenant-123');

            // L2 should be cleared
            expect(cache.getTenant('tenant-123')).toBeUndefined();
        });

        it('should clear L1 when invalidating domain (aggressive invalidation)', () => {
            cache.setTenantId('example.com', 'tenant-456');

            expect(cache.getTenantId('example.com')).toBe('tenant-456');

            // Invalidate domain (L1)
            cache.invalidateDomain('example.com');

            expect(cache.getTenantId('example.com')).toBeUndefined();
        });

        it('should clear all caches on clear()', () => {
            // Populate both caches
            cache.setTenantId('domain1.com', 'tenant-1');
            cache.setTenantId('domain2.com', 'tenant-2');
            cache.setTenant('tenant-1', mockTenant);
            cache.setTenant('tenant-2', { ...mockTenant, id: 'tenant-2' });

            // Clear all
            cache.clear();

            // All should be gone
            expect(cache.getTenantId('domain1.com')).toBeUndefined();
            expect(cache.getTenantId('domain2.com')).toBeUndefined();
            expect(cache.getTenant('tenant-1')).toBeUndefined();
            expect(cache.getTenant('tenant-2')).toBeUndefined();
        });
    });

    describe('Cache Stats', () => {
        it('should provide accurate cache stats', () => {
            // Populate caches
            cache.setTenantId('domain1.com', 'tenant-1');
            cache.setTenantId('domain2.com', 'tenant-2');
            cache.setTenant('tenant-1', mockTenant);

            const stats = cache.getStats();

            expect(stats.l1.size).toBe(2); // 2 domains
            expect(stats.l2.size).toBe(1); // 1 tenant
            expect(stats.l1.max).toBe(100);
            expect(stats.l2.max).toBe(50);
        });

        it('should show zero stats for empty cache', () => {
            const stats = cache.getStats();

            expect(stats.l1.size).toBe(0);
            expect(stats.l2.size).toBe(0);
        });

        it('should update stats after invalidation', () => {
            cache.setTenantId('domain.com', 'tenant-1');
            cache.setTenant('tenant-1', mockTenant);

            let stats = cache.getStats();
            expect(stats.l1.size).toBe(1);
            expect(stats.l2.size).toBe(1);

            cache.invalidateTenant('tenant-1');

            stats = cache.getStats();
            expect(stats.l1.size).toBe(1); // L1 unchanged
            expect(stats.l2.size).toBe(0); // L2 cleared
        });
    });

    describe('TTL Expiration', () => {
        it('should expire L1 entries after TTL', async () => {
            // Set entry with 1 second TTL
            cache.setTenantId('domain.com', 'tenant-1');

            // Should exist immediately
            expect(cache.getTenantId('domain.com')).toBe('tenant-1');

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 1100));

            // Should be gone
            expect(cache.getTenantId('domain.com')).toBeUndefined();
        });

        it('should expire L2 entries after TTL', async () => {
            // Set entry with 2 second TTL
            cache.setTenant('tenant-1', mockTenant);

            // Should exist immediately
            expect(cache.getTenant('tenant-1')).toEqual(mockTenant);

            // Wait for TTL to expire
            await new Promise(resolve => setTimeout(resolve, 2100));

            // Should be gone
            expect(cache.getTenant('tenant-1')).toBeUndefined();
        });

        it('should refresh TTL on access (LRU behavior)', async () => {
            cache.setTenantId('domain.com', 'tenant-1');

            // Wait half the TTL
            await new Promise(resolve => setTimeout(resolve, 600));

            // Access (should refresh TTL due to updateAgeOnGet: true)
            expect(cache.getTenantId('domain.com')).toBe('tenant-1');

            // Wait another half TTL (total time: 1.2s, but TTL refreshed at 0.6s)
            await new Promise(resolve => setTimeout(resolve, 600));

            // Should still exist (TTL was refreshed on access)
            expect(cache.getTenantId('domain.com')).toBe('tenant-1');
        });
    });

    describe('Edge Cases', () => {
        it('should handle special characters in domain names', () => {
            cache.setTenantId('über-café.com', 'tenant-special');
            expect(cache.getTenantId('über-café.com')).toBe('tenant-special');
        });

        it('should handle very long domain names', () => {
            const longDomain = 'a'.repeat(200) + '.com';
            cache.setTenantId(longDomain, 'tenant-long');
            expect(cache.getTenantId(longDomain)).toBe('tenant-long');
        });

        it('should handle tenant data with missing optional fields', () => {
            const minimalTenant: CachedTenant = {
                id: 'tenant-minimal',
                slug: 'minimal',
                name: 'Minimal Tenant',
                isActive: true,
                customDomainsEnabled: false,
                countryCode: 'US',
                currency: 'USD',
                timezone: 'America/New_York',
                theme: DEFAULT_RESOLVED_THEME,
                customDomains: []
                // features is optional
            };

            cache.setTenant('tenant-minimal', minimalTenant);
            const tenant = cache.getTenant('tenant-minimal');

            expect(tenant).toEqual(minimalTenant);
            expect(tenant?.features).toBeUndefined();
        });

        it('should handle concurrent access', () => {
            // Simulate concurrent writes
            cache.setTenantId('domain.com', 'tenant-1');
            cache.setTenantId('domain.com', 'tenant-2');
            cache.setTenantId('domain.com', 'tenant-3');

            // Last write wins
            expect(cache.getTenantId('domain.com')).toBe('tenant-3');
        });
    });
});
