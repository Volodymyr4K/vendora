import { LRUCache } from "lru-cache";
import type { Cache, CacheGetResult } from "./index.js";
import { cacheHits, cacheSize } from "../lib/metrics.js";

/**
 * Tiered Cache (L1 Memory + L2 Redis)
 * 
 * Strategy:
 * - L1: Fast, in-memory (LRU), short TTL.
 * - L2: Slower, distributed (Redis), long TTL.
 * 
 * Writes: Write to L2, then write to L1.
 * Reads: Read from L1. If miss, read from L2 and populate L1.
 * Deletes: Delete from L2, then delete from L1.
 */
export class TieredCache implements Cache {
    // L1 stores cache results of unknown types - validated at retrieval
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private l1: LRUCache<string, any>;
    private l2: Cache;
    private l1TtlSec: number;

    /**
     * Create a new TieredCache instance
     * 
     * @param l2Cache - Redis cache (distributed layer)
     * @param opts - Configuration options
     * @param opts.l1MaxItems - Max items in memory (default: 500)
     * @param opts.l1TtlSec - L1 TTL in seconds (default: 60)
     * 
     * @example
     * ```typescript
     * const redis = new RedisCache(process.env.REDIS_URL);
     * const cache = new TieredCache(redis, {
     *   l1MaxItems: 500,
     *   l1TtlSec: 60
     * });
     * ```
     */
    constructor(l2Cache: Cache, opts: { l1MaxItems?: number; l1TtlSec?: number } = {}) {
        this.l2 = l2Cache;
        this.l1TtlSec = opts.l1TtlSec || 60; // Default L1 TTL: 1 minute

        this.l1 = new LRUCache({
            max: opts.l1MaxItems || 500, // Safety cap
            ttl: this.l1TtlSec * 1000,
            updateAgeOnGet: false,
        });
    }

    async get<T>(key: string): Promise<CacheGetResult<T>> {
        const _start = Date.now();

        // 1. Check L1 (Memory)
        const l1Entry = this.l1.get(key) as CacheGetResult<T> | undefined;
        if (l1Entry) {
            cacheHits.inc({ cache_layer: 'l1', hit: 'true', operation: 'get' });
            return l1Entry;
        }
        cacheHits.inc({ cache_layer: 'l1', hit: 'false', operation: 'get' });

        // 2. Check L2 (Redis)
        const l2Entry = await this.l2.get<T>(key);
        if (l2Entry) {
            cacheHits.inc({ cache_layer: 'l2', hit: 'true', operation: 'get' });

            // Populate L1 (write-through / read-repair)
            // We store the *entire* result (value + metadata) in L1
            // L1 TTL should be the minimum of configured L1 limit OR remaining L2 TTL
            // But for simplicity, we stick to fixed L1 TTL to ensure eventual consistency
            this.l1.set(key, l2Entry);

            return l2Entry;
        }

        cacheHits.inc({ cache_layer: 'l2', hit: 'false', operation: 'get' });
        return null;
    }

    async set<T>(key: string, value: T, ttlSec: number, staleSec: number): Promise<void> {
        // 1. Write to L2 (Distributed Source of Truth)
        await this.l2.set(key, value, ttlSec, staleSec);

        // 2. Write to L1
        // We construct the entry manually to mimic what L2 returns
        // Note: ageSec is 0 because we just created it
        const entry: CacheGetResult<T> = { value, stale: false, ageSec: 0 };

        // L1 TTL is separate from L2 TTL. 
        // Usually L1 is shorter to allow refreshing from L2 if needed, 
        // or we rely on PubSub invalidation.
        this.l1.set(key, entry);

        cacheSize.inc({ cache_layer: 'l1' }); // Rough tracking
    }

    async del(key: string): Promise<void> {
        await this.l2.del(key);
        this.l1.delete(key);
    }

    /**
     * Delete keys matching a pattern
     * 
     * ⚠️ **PERFORMANCE WARNING**: This method performs a Redis SCAN operation
     * and clears the entire L1 cache. Only use in Admin/Background jobs.
     * 
     * **DO NOT** use in hot paths (e.g., checkout flow).
     * 
     * @param pattern - Glob pattern (e.g., "tenant:123:*")
     * 
     * @example
     * ```typescript
     * // Admin operation - invalidate all menu cache for tenant
     * await cache.delPattern('tenant:123:menu:*');
     * ```
     */
    async delPattern(pattern: string): Promise<void> {
        // WARN: Performance Hazard
        // Valid only for Admin/Background jobs
        await this.l2.delPattern(pattern);

        // For L1, LRUCache doesn't support pattern delete efficiently.
        // If pattern is "*", ignore or clear all?
        // "Safe" approach for L1 in Tiered setup: ANY pattern delete clears ALL L1.
        // Why? iterating keys in L1 is fast but checking pattern match is overhead.
        // Given L1 is small (500 items), clearing all is safe and ensures consistency.
        this.l1.clear();
    }

    async close(): Promise<void> {
        this.l1.clear();
        await this.l2.close();
    }

    stats() {
        return {
            kind: "tiered",
            l1Size: this.l1.size,
            l2: this.l2.stats()
        };
    }
}
