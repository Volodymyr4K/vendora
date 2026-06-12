export type FetchJsonOptions = {
  timeoutMs: number;
  retries: number;
  backoffMs: number;
  headers?: Record<string, string>;
  requestId?: string;
  op?: string;
};

export type FetchResult<T = unknown> = {
  status: number;
  headers: Record<string, string>;
  json: T;
};

export class UpstreamHttpError extends Error {
  readonly status: number | null;
  readonly url: string;
  readonly method: string;
  readonly isTimeout: boolean;
  readonly op?: string;
  readonly cause: unknown;

  constructor(
    message: string,
    options: {
      status: number | null;
      url: string;
      method: string;
      isTimeout: boolean;
      op?: string;
      cause: unknown;
    }
  ) {
    super(message);
    this.name = "UpstreamHttpError";
    this.status = options.status;
    this.url = options.url;
    this.method = options.method;
    this.isTimeout = options.isTimeout;
    this.op = options.op;
    this.cause = options.cause;
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function lowerHeaders(h: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  h.forEach((v, k) => (out[k.toLowerCase()] = v));
  return out;
}

/**
 * fetchJson — resilient JSON fetch helper
 * Supports GET/POST/etc via `init`.
 */
export async function fetchJson<T = unknown>(url: string, opts: FetchJsonOptions, init?: RequestInit): Promise<T> {
  const res = await fetchJsonWithMeta<T>(url, opts, init);
  return res.json;
}

/**
 * fetchJsonWithMeta — same as fetchJson but returns status + headers.
 * Useful for upstream probing/discovery.
 */
export async function fetchJsonWithMeta<T = unknown>(
  url: string,
  opts: FetchJsonOptions,
  init?: RequestInit
): Promise<FetchResult<T>> {
  const baseHeaders: Record<string, string> = { ...(opts.headers || {}) };
  if (opts.requestId) baseHeaders["x-request-id"] = opts.requestId;

  const method = init?.method || "GET";
  let lastErr: unknown = null;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), opts.timeoutMs);

    try {
      const initHeaders: Record<string, string> = {};
      if (init?.headers) {
        if (init.headers instanceof Headers) {
          init.headers.forEach((v, k) => {
            initHeaders[k] = v;
          });
        } else if (Array.isArray(init.headers)) {
          init.headers.forEach(([k, v]) => {
            initHeaders[k] = v;
          });
        } else {
          Object.assign(initHeaders, init.headers);
        }
      }
      const mergedHeaders: Record<string, string> = { ...baseHeaders, ...initHeaders };
      if (baseHeaders["x-tenant-slug"]) mergedHeaders["x-tenant-slug"] = baseHeaders["x-tenant-slug"];
      if (baseHeaders["x-request-id"]) mergedHeaders["x-request-id"] = baseHeaders["x-request-id"];

      const r = await fetch(url, {
        method,
        headers: mergedHeaders,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        body: init?.body as any,
        signal: ac.signal,
      });

      const text = await r.text();
      const ct = (r.headers.get("content-type") || "").toLowerCase();

      // Allow JSON with charset, or some apis that return text/json-ish
      const looksJson = ct.includes("application/json") || ct.includes("+json") || text.trim().startsWith("{") || text.trim().startsWith("[");

      if (!looksJson) {
        throw new UpstreamHttpError(
          `Upstream HTTP ${r.status}`,
          {
            status: r.status,
            url,
            method,
            isTimeout: false,
            op: opts.op,
            cause: new Error(`Non-JSON content type: ${ct || "?"}`)
          }
        );
      }

      let json: T;
      try {
        json = JSON.parse(text);
      } catch (e) {
        throw new UpstreamHttpError(
          "Upstream JSON parse error",
          {
            status: r.status,
            url,
            method,
            isTimeout: false,
            op: opts.op,
            cause: e
          }
        );
      }

      if (!r.ok) {
        throw new UpstreamHttpError(
          `Upstream HTTP ${r.status}`,
          {
            status: r.status,
            url,
            method,
            isTimeout: false,
            op: opts.op,
            cause: null
          }
        );
      }

      return { status: r.status, headers: lowerHeaders(r.headers), json };
    } catch (e: unknown) {
      // Check if this is an AbortError (timeout)
      if (e instanceof Error && e.name === "AbortError") {
        lastErr = new UpstreamHttpError(
          "Upstream request timeout",
          {
            status: null,
            url,
            method,
            isTimeout: true,
            op: opts.op,
            cause: e
          }
        );
      } else if (e instanceof UpstreamHttpError) {
        lastErr = e;
      } else {
        // Network errors or other fetch failures
        lastErr = new UpstreamHttpError(
          "Upstream network error",
          {
            status: null,
            url,
            method,
            isTimeout: false,
            op: opts.op,
            cause: e
          }
        );
      }

      if (attempt < opts.retries) {
        await sleep(opts.backoffMs * (attempt + 1));
        continue;
      }
    } finally {
      clearTimeout(t);
    }
  }

  // RE-THROW the last error (do not swallow)
  throw lastErr;
}
