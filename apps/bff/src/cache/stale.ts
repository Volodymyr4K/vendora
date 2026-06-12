import type { Cache } from "./index.js";

export type GetOrSetResult<T> = {
  data: T;
  cacheHit: boolean;
  stale: boolean;
  ageSec: number;
  from: "cache" | "upstream" | "stale";
};

export type GetOrSetOptions = {
  swr?: boolean; // stale-while-revalidate (serve stale fast + refresh in background)
  onRevalidateError?: (e: unknown) => void;
};

// Single-flight per key to avoid stampedes (both for foreground misses and SWR background revalidate).
const inflight = new Map<string, Promise<unknown>>();

async function revalidate<T>(cache: Cache, key: string, ttlSec: number, staleSec: number, fetcher: () => Promise<T>, opts: GetOrSetOptions) {
  if (inflight.has(key)) return;
  const p: Promise<unknown> = (async () => {
    try {
      const data = await fetcher();
      await cache.set(key, data, ttlSec, staleSec);
    } catch (e) {
      opts.onRevalidateError?.(e);
    } finally {
      inflight.delete(key);
    }
  })();
  inflight.set(key, p);
}

export async function getOrSet<T>(
  cache: Cache,
  key: string,
  ttlSec: number,
  staleSec: number,
  fetcher: () => Promise<T>,
  opts: GetOrSetOptions = {}
): Promise<GetOrSetResult<T>> {
  const hit = await cache.get<T>(key);

  // fresh cache
  if (hit && !hit.stale) {
    return { data: hit.value, cacheHit: true, stale: false, ageSec: hit.ageSec, from: "cache" };
  }

  // stale-while-revalidate: return stale quickly + refresh in background
  if (hit && hit.stale && opts.swr) {
    void revalidate(cache, key, ttlSec, staleSec, fetcher, opts);
    return { data: hit.value, cacheHit: true, stale: true, ageSec: hit.ageSec, from: "stale" };
  }

  // default: try upstream (may block), fallback to stale if available
  try {
    const existing = inflight.get(key);
    if (existing) {
      // Another request is already fetching; wait and retry cache once for a HIT-style response.
      await existing;
      const refreshed = await cache.get<T>(key);
      if (refreshed && !refreshed.stale) {
        return { data: refreshed.value, cacheHit: true, stale: false, ageSec: refreshed.ageSec, from: "cache" };
      }
    }

    const p: Promise<T> = (async () => {
      try {
        const data = await fetcher();
        await cache.set(key, data, ttlSec, staleSec);
        return data;
      } finally {
        inflight.delete(key);
      }
    })();
    inflight.set(key, p);

    const data = await p;
    return { data, cacheHit: !!hit, stale: false, ageSec: 0, from: "upstream" };
  } catch (e) {
    if (hit) {
      return { data: hit.value, cacheHit: true, stale: true, ageSec: hit.ageSec, from: "stale" };
    }
    throw e;
  }
}
