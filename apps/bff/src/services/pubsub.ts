import type { Cache } from "../cache/index.js";
import { logger } from '../lib/logger.js';
import type Redis from "ioredis";
import { createRedisClient, resolveRedisUrlFromEnv } from "../lib/redis-client.js";

export class PubSubService {
    private sub: Redis;
    private pub: Redis;
    private channel = "cache:invalidate";
    private localCache: Cache;

    constructor(redisUrl: string | undefined, localCache: Cache) {
        const resolved = redisUrl || resolveRedisUrlFromEnv();
        if (!resolved) {
            throw new Error("PubSub requires Redis configuration (REDIS_URL or REDIS_HOST/PORT)");
        }
        // Create dedicated connections for Pub/Sub (blocking operations)
        this.sub = createRedisClient("pubsub-sub", { enableOfflineQueue: true }, resolved);
        this.pub = createRedisClient("pubsub-pub", { enableOfflineQueue: true }, resolved);
        this.localCache = localCache;

        // Note: additional error handlers are attached in createRedisClient()
    }

    async connect() {
        // Subscribe to invalidation channel
        await this.sub.subscribe(this.channel);

        this.sub.on("message", async (channel, message) => {
            if (channel === this.channel) {
                // message is the Key OR Pattern
                // If it ends with *, we treat it as a pattern (though Cache interface needs support for that)
                // For now, our Cache interface only supports simple 'del'.
                // If pattern support is needed locally, we'd need to extend Cache interface.
                // However, for MemoryCache, deleting by pattern means iterating.
                // Let's assume the message carries exact keys OR we handle pattern logic here.

                // HACK: If message contains '*', we might need to iterate local store if it's MemoryCache.
                // But MemoryCache (L1) usually doesn't expose iteration easily.
                // Safe Bet: Just try to delete strict key for now, OR implement pattern scan if critical.
                // For this implementation, we will use it for Direct Key Invalidation mostly, but if Pattern is sent,
                // we'll need to handle it. Given user requirement "Wildcard Busting", we MUST handle patterns.

                logger.info(`[PubSub] Received invalidation: ${message}`);

                // If message contains '*', treat as wildcard pattern
                if (message.includes('*')) {
                    await this.localCache.delPattern(message);
                } else {
                    await this.localCache.del(message);
                }
            }
        });
    }

    async publishInvalidation(keyOrPattern: string) {
        await this.pub.publish(this.channel, keyOrPattern);
    }

    async publish(channel: string, message: string) {
        await this.pub.publish(channel, message);
    }

    async close() {
        await this.sub.quit();
        await this.pub.quit();
    }
}
