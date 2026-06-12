import { describe, it, expect } from "vitest";
import { getOrSet } from "../src/cache/stale";
import type { Cache, CacheGetResult } from "../src/cache";

class FakeCache implements Cache {
  constructor(private entry: CacheGetResult<any>) {}
  public setCalls: any[] = [];
  async get<T>(_key: string): Promise<CacheGetResult<T>> {
    return this.entry as any;
  }
  async set<T>(key: string, value: T, _ttl: number, _stale: number): Promise<void> {
    this.setCalls.push({ key, value });
  }
  stats() {
    return { kind: "fake" };
  }
}

describe("getOrSet (SWR)", () => {
  it("serves stale immediately and revalidates in background when swr=true", async () => {
    const cache = new FakeCache({ value: { ok: "stale" }, stale: true, ageSec: 120 });
    let resolveFetcher: ((v:any)=>void) | null = null;

    const fetcher = () =>
      new Promise((res) => {
        resolveFetcher = res;
      });

    const r = await Promise.race([
      getOrSet(cache, "k", 10, 100, fetcher as any, { swr: true }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout waiting getOrSet")), 100)),
    ]) as any;

    expect(r.from).toBe("stale");
    expect(r.data.ok).toBe("stale");

    // now complete revalidation
    resolveFetcher?.({ ok: "fresh" });
    await new Promise((r) => setTimeout(r, 10));
    expect(cache.setCalls.length).toBe(1);
    expect(cache.setCalls[0].value.ok).toBe("fresh");
  });
});