import Redis from "ioredis";
import { LRUCache } from "lru-cache";
import { TieredCache } from "./tiered.js";
import { logger } from "../lib/logger.js";
import { createRedisClient } from "../lib/redis-client.js";

export type CacheGetResult<T> = { value: T; stale: boolean; ageSec: number } | null;

export interface Cache {
  get<T>(key: string): Promise<CacheGetResult<T>>;
  set<T>(key: string, value: T, ttlSec: number, staleSec: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern(pattern: string): Promise<void>; // New method for wildcard deletion
  close(): Promise<void>;
  stats(): { kind: string };
}

/**
 * Memory cache with TTL + serve-stale window.
 * Keeps entries up to staleSec and marks as stale when ttlSec is exceeded.
 */
type Entry<T> = { value: T; savedAt: number; ttlSec: number; staleSec: number };

export class MemoryCache implements Cache {
  // Upgraded to LRU to prevent memory leaks
  // Cache stores values of unknown types - validated at retrieval
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private store: LRUCache<string, Entry<any>>;

  constructor() {
    this.store = new LRUCache({
      max: 1000,
      ttl: 24 * 60 * 60 * 1000 // 24h default safety
    });
  }

  async get<T>(key: string): Promise<CacheGetResult<T>> {
    const e = this.store.get(key);
    if (!e) return null;

    const ageSec = (Date.now() - e.savedAt) / 1000;
    if (ageSec <= e.ttlSec) return { value: e.value as T, stale: false, ageSec };
    if (ageSec <= e.staleSec) return { value: e.value as T, stale: true, ageSec };

    this.store.delete(key);
    return null;
  }

  async set<T>(key: string, value: T, ttlSec: number, staleSec: number) {
    this.store.set(key, { value, savedAt: Date.now(), ttlSec, staleSec }, { ttl: staleSec * 1000 });
  }

  async del(key: string) {
    this.store.delete(key);
  }

  async delPattern(pattern: string) {
    // Simple wildcard support: if pattern ends with '*', match prefix
    // For LRU, iterating is still possible but expensive.
    // Small cache -> iterate keys
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      for (const key of this.store.keys()) {
        if (key.startsWith(prefix)) {
          this.store.delete(key);
        }
      }
    } else {
      this.store.delete(pattern);
    }
  }

  async close() {
    this.store.clear();
  }

  stats() {
    return { kind: "memory", size: this.store.size };
  }
}


/**
 * Redis cache implementation using JSON blobs.
 * Stores max lifetime as staleSec (Redis TTL), internally tracks ttlSec to decide stale vs fresh.
 */
export class RedisCache implements Cache {
  private redis: Redis;

  constructor(redis: Redis) {
    this.redis = redis;
    // Avoid unhandled error events (in addition to factory handlers)
    this.redis.on("error", (err) => {
      logger.error({ error: err?.message ?? String(err) }, "[RedisCache] Redis error");
    });
  }

  async get<T>(key: string): Promise<CacheGetResult<T>> {
    const raw = await this.redis.get(key);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as Entry<T>;
      const ageSec = (Date.now() - parsed.savedAt) / 1000;

      if (ageSec <= parsed.ttlSec) return { value: parsed.value, stale: false, ageSec };
      if (ageSec <= parsed.staleSec) return { value: parsed.value, stale: true, ageSec };

      return null;
    } catch {
      return null;
    }
  }

  async set<T>(key: string, value: T, ttlSec: number, staleSec: number) {
    const blob: Entry<T> = { value, savedAt: Date.now(), ttlSec, staleSec };
    // keep in redis up to staleSec, so serve-stale works even after ttlSec
    await this.redis.set(key, JSON.stringify(blob), "EX", Math.max(1, Math.floor(staleSec)));
  }

  async del(key: string) {
    await this.redis.del(key);
  }

  async delPattern(pattern: string) {
    // Use SCAN to find keys
    let cursor = "0";
    do {
      const [nextCursor, keys] = await this.redis.scan(cursor, "MATCH", pattern, "COUNT", 100);
      cursor = nextCursor;
      if (keys.length > 0) {
        await this.redis.del(...keys);
      }
    } while (cursor !== "0");
  }

  async close() {
    await this.redis.quit();
  }

  stats() {
    return { kind: "redis" };
  }
}


export async function createCache(opts: { mode: "memory" | "redis"; redisUrl?: string }): Promise<Cache> {
  if (opts.mode === "redis") {
    if (!opts.redisUrl) throw new Error("CACHE_MODE=redis requires REDIS_URL");
    // Prefer centralized client factory for consistent TLS/retry/error handling.
    const redis = new RedisCache(createRedisClient("cache", undefined, opts.redisUrl));

    // Automatically wrap in Tiered Cache for performance
    // unless explicitly disabled (can add config later)
    return new TieredCache(redis);
  }
  return new MemoryCache();
}
