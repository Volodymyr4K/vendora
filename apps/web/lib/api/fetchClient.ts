"use client";

export interface FetchClientOptions extends RequestInit {
    timeoutMs?: number;
}

/**
 * Client-side fetch gate for internal Next.js API routes.
 * Invariant: only relative URLs (starting with "/") are allowed.
 */
export async function fetchClient(url: string, init?: FetchClientOptions): Promise<Response> {
    if (!url.startsWith("/")) {
        throw new Error(`[Client API] Only relative URLs are allowed. Received: ${url}`);
    }

    const { timeoutMs, ...rest } = init ?? {};

    if (!timeoutMs) {
        return fetch(url, rest);
    }

    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), timeoutMs);

    try {
        return await fetch(url, { ...rest, signal: ac.signal });
    } finally {
        clearTimeout(timer);
    }
}

export async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    return fetchClient(url, { ...init, timeoutMs });
}
