/**
 * Cache Manager - Enterprise-grade dual-LRU caching
 * 
 * L1 (Mapping): domain → tenantId (O(1) lookups)
 * L2 (Data): tenantId → tenant object (O(1) lookups)
 * 
 * Features:
 * - Lazy invalidation (O(1) complexity)
 * - Auto-expiry via TTL
 * - Ghost domain protection
 * - Subdomain caching support
 */

import { LRUCache } from 'lru-cache';
import type { MainTemplateId, ResolvedTheme, TenantFeatures } from '@vendora/contracts';
import type { BranchesMode } from '@vendora/database';
import { cacheHits, cacheSize } from '../lib/metrics.js';

export interface CachedTenant {
    id: string;
    slug: string;
    name: string;
    isActive: boolean;
    customDomainsEnabled: boolean;
    branchesMode: BranchesMode;
    defaultBranchId?: string | null;
    defaultBranch?: { slug: string } | null;
    countryCode: string;
    currency: string;
    timezone: string; // IANA timezone identifier
    features?: TenantFeatures | null; // Feature flags; null = tenant not configured (503)
    theme: ResolvedTheme; // Design tokens (from settings.theme, normalized); audit 3.4
    mainTemplate: MainTemplateId; // Tenant main template (settings.mainTemplate)
    amContent?: unknown; // Tenant AM content (settings.amContent)
    customDomains: Array<{
        domain: string;
        status: string;
    }>;
}

export class CacheManager {
    // L1: Domain → TenantId mapping (includes subdomains and custom domains)
    private mappingCache: LRUCache<string, string>;

    // L2: TenantId → Tenant data
    private dataCache: LRUCache<string, CachedTenant>;

    constructor(options?: {
        l1Max?: number;
        l1Ttl?: number;
        l2Max?: number;
        l2Ttl?: number;
    }) {
        const l1Max = options?.l1Max || Number(process.env.CACHE_L1_MAX) || 10000;
        const l1Ttl = options?.l1Ttl || Number(process.env.CACHE_L1_TTL) || 5 * 60 * 1000; // 5min
        const l2Max = options?.l2Max || Number(process.env.CACHE_L2_MAX) || 5000;
        const l2Ttl = options?.l2Ttl || Number(process.env.CACHE_L2_TTL) || 10 * 60 * 1000; // 10min

        // L1: Small, high-frequency lookups (both subdomains and custom domains)
        this.mappingCache = new LRUCache({
            max: l1Max,
            ttl: l1Ttl,
            updateAgeOnGet: true // LRU behavior
        });

        // L2: Larger objects, less frequent misses
        this.dataCache = new LRUCache({
            max: l2Max,
            ttl: l2Ttl,
            updateAgeOnGet: true
        });
    }

    /**
     * Get tenant ID from domain (L1 lookup)
     * Works for both subdomains (tenant.vendora.local) and custom domains (example.com)
     */
    getTenantId(domain: string): string | undefined {
        const value = this.mappingCache.get(domain);

        // Phase 3: Track cache hits/misses
        cacheHits.inc({
            cache_layer: 'L1',
            hit: value ? 'true' : 'false',
            operation: 'get'
        });

        return value;
    }

    /**
     * Set domain → tenantId mapping (L1)
     */
    setTenantId(domain: string, tenantId: string): void {
        this.mappingCache.set(domain, tenantId);

        // Phase 3: Track cache size
        cacheSize.inc({ cache_layer: 'L1' });
    }

    /**
     * Get tenant data (L2 lookup)
     */
    getTenant(tenantId: string): CachedTenant | undefined {
        const value = this.dataCache.get(tenantId);

        // Phase 3: Track L2 cache hits/misses
        cacheHits.inc({
            cache_layer: 'L2',
            hit: value ? 'true' : 'false',
            operation: 'get'
        });

        return value;
    }

    /**
     * Set tenant data (L2)
     */
    setTenant(tenantId: string, tenant: CachedTenant): void {
        this.dataCache.set(tenantId, tenant); 
        
        // Phase 3: Track L2 cache size
        cacheSize.inc({ cache_layer: 'L2' });
    }

    /**
     * Lazy invalidation - O(1) complexity
     * Only clears L2, L1 auto-expires via TTL
     * 
     * Called when:
     * - Domain verified/activated
     * - Tenant settings changed
     * - Custom domain added/removed
     */
    invalidateTenant(tenantId: string): void {
        this.dataCache.delete(tenantId);
        // L1 mappings will auto-expire (TTL) or re-validate on next request
    }

    /**
     * Aggressive invalidation for specific domain - O(1)
     * 
     * Called when:
     * - Domain deleted
     * - Ghost domain detected
     */
    invalidateDomain(domain: string): void {
        this.mappingCache.delete(domain);
        // L2 will re-fetch on next request if needed
    }

    /**
     * Clear all caches (emergency use only)
     */
    clear(): void {
        this.mappingCache.clear();
        this.dataCache.clear();
    }

    /**
     * Get cache stats for monitoring/Prometheus
     */
    getStats() {
        return {
            l1: {
                size: this.mappingCache.size,
                calculatedSize: this.mappingCache.calculatedSize,
                max: this.mappingCache.max,
                hitRate: this.mappingCache.size > 0
                    ? ((this.mappingCache.size / this.mappingCache.max) * 100).toFixed(2)
                    : '0.00'
            },
            l2: {
                size: this.dataCache.size,
                calculatedSize: this.dataCache.calculatedSize,
                max: this.dataCache.max,
                hitRate: this.dataCache.size > 0
                    ? ((this.dataCache.size / this.dataCache.max) * 100).toFixed(2)
                    : '0.00'
            }
        };
    }
}

// Singleton instance
export const cacheManager = new CacheManager();
