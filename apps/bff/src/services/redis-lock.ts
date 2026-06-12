import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';
import { createRedisClient } from "../lib/redis-client.js";

const redis = createRedisClient("lock");

const LUA_SCRIPT_RELEASE = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
    else
        return 0
    end
`;

/**
 * Robust Distributed Lock Implementation
 * Features:
 * - Connection resilience (auto-reconnect, exponential backoff)
 * - Safe lock ownership (UUID verification)
 * - Atomic release (Lua script)
 * - Deadlock prevention (TTL)
 */
export class RedisLock {
    /**
     * Acquire distributed lock securely
     * @param key Lock key
     * @param ttl Time-to-live in seconds
     * @returns Owner ID (UUID) if acquired, null otherwise
     */
    static async acquire(key: string, ttl: number = 30): Promise<string | null> {
        try {
            const ownerId = randomUUID();
            // 'NX' = Only set if not exists
            // 'EX' = Set expiry (TTL)
            const result = await redis.set(key, ownerId, 'EX', ttl, 'NX');
            return result === 'OK' ? ownerId : null;
        } catch (error) {
            logger.error({ key, error }, 'Failed to acquire Redis lock');
            return null;
        }
    }

    /**
     * Release lock safely (only if we own it)
     * @param key Lock key
     * @param ownerId The UUID obtained from acquire()
     */
    static async release(key: string, ownerId: string): Promise<void> {
        try {
            await redis.eval(LUA_SCRIPT_RELEASE, 1, key, ownerId);
        } catch (error) {
            logger.error({ key, error }, 'Failed to release Redis lock');
        }
    }

    /**
     * Sleep helper for retries
     */
    private static async sleep(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Execute function with distributed lock
     * 
     * @param key Unique lock key
     * @param ttlSeconds Lock TTL (max execution time protection)
     * @param fn Function to execute
     * @param options Retry configuration
     */
    static async withLock<T>(
        key: string,
        ttlSeconds: number,
        fn: () => Promise<T>,
        options?: {
            maxRetries?: number;
            retryDelayMs?: number;
        }
    ): Promise<T | null> {
        const maxRetries = options?.maxRetries || 3;
        const retryDelay = options?.retryDelayMs || 200; // 200ms default pause

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const ownerId = await this.acquire(key, ttlSeconds);

            if (ownerId) {
                try {
                    // console.debug(`[REDIS-LOCK] ✓ Acquired: ${key}`);
                    return await fn();
                } finally {
                    await this.release(key, ownerId);
                    // console.debug(`[REDIS-LOCK] Released: ${key}`);
                }
            }

            // Lock not acquired
            if (attempt < maxRetries) {
                // Wait before retry to prevent CPU/Redis spam
                await this.sleep(retryDelay);
            }
        }

        logger.warn(`[REDIS-LOCK] ✗ Failed to acquire lock after ${maxRetries} attempts: ${key}`);
        return null;
    }
}
