import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolveTenant } from '../tenant-resolver.js';
import { cacheManager } from '../cache-manager.js';
import { prisma } from '@vendora/database';

// Mock the database module
vi.mock('@vendora/database', () => ({
    prisma: {
        tenant: {
            findUnique: vi.fn(),
        },
        customDomain: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
        }
    }
}));

// Mock cache manager
vi.mock('../cache-manager', () => ({
    cacheManager: {
        getTenantId: vi.fn(),
        setTenantId: vi.fn(),
        getTenant: vi.fn(),
        setTenant: vi.fn(),
        invalidateDomain: vi.fn(),
        clear: vi.fn()
    }
}));

describe('TenantResolver', () => {
    const mockTenant = {
        id: 'tenant-123',
        slug: 'vendora',
        name: 'Vendora Sushi',
        isActive: true,
        customDomainsEnabled: true,
        branchesMode: 'MULTI',
        defaultBranchId: null,
        defaultBranch: null,
        countryCode: 'UA',
        currency: 'UAH',
        timezone: 'Europe/Kiev',
        customDomains: [],
        // New required fields from schema
        features: {},
        settings: {},
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01')
    };

    beforeEach(() => {
        vi.clearAllMocks();
        process.env.BASE_DOMAIN = 'vendora.local';
        process.env.CUSTOM_DOMAINS_ENABLED = 'true';
    });

    describe('Subdomain Resolution', () => {
        it('should resolve tenant from subdomain', async () => {
            // Mock L1 miss
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);

            // Mock L2 miss (will fetch from DB)
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            // Mock DB response
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant);

            const result = await resolveTenant(prisma, 'vendora.vendora.local');

            expect(result).not.toBeNull();
            expect(result?.tenant.id).toBe('tenant-123');
            expect(result?.type).toBe('subdomain');

            // Verify DB was called (explicit select including settings for theme — audit 3.4)
            expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
                where: { slug: 'vendora', isActive: true },
                select: {
                    id: true,
                    slug: true,
                    name: true,
                    isActive: true,
                    customDomainsEnabled: true,
                    branchesMode: true,
                    defaultBranchId: true,
                    defaultBranch: { select: { slug: true } },
                    countryCode: true,
                    currency: true,
                    timezone: true,
                    features: true,
                    settings: true,
                },
            });

            // Verify cache was populated
            expect(cacheManager.setTenantId).toHaveBeenCalledWith('vendora.vendora.local', 'tenant-123');
            expect(cacheManager.setTenant).toHaveBeenCalled();
        });

        it('should return null for inactive tenant', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

            const result = await resolveTenant(prisma, 'inactive.vendora.local');

            expect(result).toBeNull();
        });

        it('should normalize domain (remove trailing dot, lowercase)', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant);

            await resolveTenant(prisma, 'VENDORA.vendora.local.');

            // Should normalize to lowercase without trailing dot
            expect(cacheManager.setTenantId).toHaveBeenCalledWith('vendora.vendora.local', 'tenant-123');
        });
    });

    describe('Custom Domain Resolution', () => {
        it('should resolve tenant from custom domain', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            const mockCustomDomain = {
                domain: 'example.com',
                tenantId: 'tenant-123',
                status: 'VERIFIED'
            };

            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(mockCustomDomain as any);
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
                ...mockTenant,
                customDomains: [{ domain: 'example.com', status: 'VERIFIED' }]
            } as any);

            const result = await resolveTenant(prisma, 'example.com');

            expect(result).not.toBeNull();
            expect(result?.tenant.id).toBe('tenant-123');
            expect(result?.type).toBe('custom');

            // Verify custom domain lookup
            expect(prisma.customDomain.findFirst).toHaveBeenCalledWith({
                where: { domain: 'example.com', status: 'VERIFIED' },
                select: { tenantId: true, domain: true, status: true }
            });
        });

        it('should return null if custom domain not found', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result = await resolveTenant(prisma, 'nonexistent.com');

            expect(result).toBeNull();
        });

        it('should return null if custom domain status is PENDING', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result = await resolveTenant(prisma, 'pending.com');

            expect(result).toBeNull();
            expect(cacheManager.setTenantId).not.toHaveBeenCalled();
        });

        it('should return null if custom domain status is FAILED', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result = await resolveTenant(prisma, 'failed.com');

            expect(result).toBeNull();
            expect(cacheManager.setTenantId).not.toHaveBeenCalled();
        });

        it('should NOT cache PENDING domain on repeated resolution', async () => {
            // First resolution attempt
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result1 = await resolveTenant(prisma, 'pending.com');
            expect(result1).toBeNull();
            expect(cacheManager.setTenantId).not.toHaveBeenCalled();

            // Second resolution attempt (should still not cache)
            vi.clearAllMocks();
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result2 = await resolveTenant(prisma, 'pending.com');
            expect(result2).toBeNull();
            expect(cacheManager.setTenantId).not.toHaveBeenCalled();
        });

        it('should NOT cache FAILED domain on repeated resolution', async () => {
            // First resolution attempt
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result1 = await resolveTenant(prisma, 'failed.com');
            expect(result1).toBeNull();
            expect(cacheManager.setTenantId).not.toHaveBeenCalled();

            // Second resolution attempt (should still not cache)
            vi.clearAllMocks();
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.customDomain.findFirst).mockResolvedValue(null);

            const result2 = await resolveTenant(prisma, 'failed.com');
            expect(result2).toBeNull();
            expect(cacheManager.setTenantId).not.toHaveBeenCalled();
        });

        it('should return null if custom domains disabled for tenant', async () => {
            // Simulate L2 cache miss to force DB fetch
            vi.mocked(cacheManager.getTenantId).mockReturnValue('tenant-456');
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            // Mock DB response with customDomainsEnabled: false
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
                ...mockTenant,
                id: 'tenant-456',
                customDomainsEnabled: false,
                customDomains: [{ domain: 'example.com', status: 'VERIFIED' }]
            } as any);

            const result = await resolveTenant(prisma, 'example.com');

            expect(result).toBeNull();
        });

        it('should return null if custom domains globally disabled', async () => {
            process.env.CUSTOM_DOMAINS_ENABLED = '';

            const result = await resolveTenant(prisma, 'example.com');

            expect(result).toBeNull();
        });
    });

    describe('Ghost Domain Protection', () => {
        it('should detect and invalidate ghost domains', async () => {
            // L1 hit: domain maps to tenantId
            vi.mocked(cacheManager.getTenantId).mockReturnValue('tenant-123');

            // L2 miss: fetch from DB
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            // DB returns tenant WITHOUT this custom domain (was deleted)
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
                ...mockTenant,
                customDomains: [] // Domain NOT in list!
            } as any);

            const result = await resolveTenant(prisma, 'deleted-domain.com');

            expect(result).toBeNull();

            // Should invalidate ghost mapping
            expect(cacheManager.invalidateDomain).toHaveBeenCalledWith('deleted-domain.com');
        });

        it('should NOT invalidate valid custom domain', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue('tenant-123');
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
                ...mockTenant,
                customDomains: [{ domain: 'valid.com', status: 'VERIFIED' }]
            } as any);

            const result = await resolveTenant(prisma, 'valid.com');

            expect(result).not.toBeNull();
            expect(cacheManager.invalidateDomain).not.toHaveBeenCalled();
        });

        it('should handle inactive tenant and invalidate domain', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue('tenant-123');
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
                ...mockTenant,
                isActive: false
            } as any);

            const result = await resolveTenant(prisma, 'inactive-tenant.com');

            expect(result).toBeNull();
            expect(cacheManager.invalidateDomain).toHaveBeenCalled();
        });
    });

    describe('Cache Behavior (Critical: Spy Verification)', () => {
        it('should skip DB query on L1 + L2 cache hit', async () => {
            // L1 hit: domain → tenantId
            vi.mocked(cacheManager.getTenantId).mockReturnValue('tenant-123');

            // L2 hit: tenantId → tenant data
            vi.mocked(cacheManager.getTenant).mockReturnValue(mockTenant as any);

            const result = await resolveTenant(prisma, 'vendora.vendora.local');

            // Should use cached data
            expect(result).not.toBeNull();
            expect(result?.tenant.id).toBe('tenant-123');

            // ✅ CRITICAL: Prisma should NOT be called
            expect(prisma.tenant.findUnique).toHaveBeenCalledTimes(0);
            expect(prisma.customDomain.findFirst).toHaveBeenCalledTimes(0);
        });

        it('should query DB on L1 miss (subdomain)', async () => {
            // L1 miss
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant);

            await resolveTenant(prisma, 'vendora.vendora.local');

            // Should call DB (may be called multiple times: initial lookup + full fetch)
            expect(prisma.tenant.findUnique).toHaveBeenCalled();
        });

        it('should query DB on L2 miss (tenant data not cached)', async () => {
            // L1 hit
            vi.mocked(cacheManager.getTenantId).mockReturnValue('tenant-123');

            // L2 miss
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);

            vi.mocked(prisma.tenant.findUnique).mockResolvedValue({
                ...mockTenant,
                customDomains: []
            } as any);

            await resolveTenant(prisma, 'vendora.vendora.local');

            // Should fetch full tenant data from DB (explicit select + isActive so inactive tenants not cached — audit 3.4)
            expect(prisma.tenant.findUnique).toHaveBeenCalledWith({
                where: { id: 'tenant-123', isActive: true },
                select: expect.objectContaining({
                    id: true,
                    slug: true,
                    name: true,
                    isActive: true,
                    customDomainsEnabled: true,
                    countryCode: true,
                    currency: true,
                    timezone: true,
                    features: true,
                    settings: true,
                    customDomains: {
                        where: { status: 'VERIFIED' },
                        select: { domain: true, status: true },
                    },
                }),
            });
        });

        it('should cache tenant data after DB fetch', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant);

            await resolveTenant(prisma, 'vendora.vendora.local');

            // Should populate L1 and L2
            expect(cacheManager.setTenantId).toHaveBeenCalled();
            expect(cacheManager.setTenant).toHaveBeenCalled();
        });
    });

    describe('Edge Cases', () => {
        it('should handle null tenant from DB', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(null);

            const result = await resolveTenant(prisma, 'nonexistent.vendora.local');

            expect(result).toBeNull();
        });

        it('should handle DB errors gracefully', async () => {
            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.tenant.findUnique).mockRejectedValue(new Error('DB connection failed'));

            await expect(resolveTenant(prisma, 'vendora.vendora.local')).rejects.toThrow('DB connection failed');
        });

        it('should handle missing BASE_DOMAIN env var', async () => {
            delete process.env.BASE_DOMAIN;

            vi.mocked(cacheManager.getTenantId).mockReturnValue(undefined);
            vi.mocked(cacheManager.getTenant).mockReturnValue(undefined);
            vi.mocked(prisma.tenant.findUnique).mockResolvedValue(mockTenant);

            // Should default to vendora.local
            const result = await resolveTenant(prisma, 'vendora.vendora.local');

            expect(result).not.toBeNull();
        });
    });
});
