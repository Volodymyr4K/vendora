import { describe, it, expect, vi } from "vitest";
import { getOrSet } from "../src/cache/stale";
import type { Cache, CacheGetResult } from "../src/cache";

class FakeCache implements Cache {
    public setCalls: Array<{ key: string; value: unknown; ttlSec: number; staleSec: number }> = [];

    constructor(private entry: CacheGetResult<unknown> = null) { }

    async get<T>(_key: string): Promise<CacheGetResult<T>> {
        return this.entry as CacheGetResult<T>;
    }

    async set<T>(key: string, value: T, ttlSec: number, staleSec: number): Promise<void> {
        this.setCalls.push({ key, value, ttlSec, staleSec });
    }

    async del(_key: string): Promise<void> { }
    async delPattern(_pattern: string): Promise<void> { }
    async close(): Promise<void> { }

    stats() {
        return { kind: "fake" };
    }
}

describe("getOrSet (Error Handling)", () => {
    it("should NOT cache when fetcher throws", async () => {
        const cache = new FakeCache(null);
        const fetcher = vi.fn().mockRejectedValue(new Error("kaboom"));

        await expect(getOrSet(cache, "test-key", 10, 20, fetcher))
            .rejects.toThrow("kaboom");

        // CRITICAL: Ensure no cache write happened on error
        expect(cache.setCalls).toHaveLength(0);
    });
});
