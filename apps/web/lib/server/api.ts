import "server-only";
import { isAppError } from "@/lib/errors";
import { cookies } from "next/headers";
import { fetchProxy } from "../data";

type FetchInput = string | URL | Request;

export class HttpError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly bodyText: string;
  public readonly payload?: unknown;

  constructor(args: {
    status: number;
    url: string;
    message: string;
    bodyText: string;
    payload?: unknown;
  }) {
    super(args.message);
    this.name = "HttpError";
    this.status = args.status;
    this.url = args.url;
    this.bodyText = args.bodyText;
    this.payload = args.payload;
  }

  toJSON(): { name: string; message: string; status: number; url: string } {
    return {
      name: this.name,
      message: this.message,
      status: this.status,
      url: this.url,
    };
  }
}

export interface ApiJsonOptions extends RequestInit {
    onResponse?: (res: Response) => void | Promise<void>;
    xTenantSlug?: string;
    tenantPolicy?: 'strict' | 'optional';
    duplex?: 'half';
}

/**
 * Canonical JSON fetcher with strict AppError propagation.
 * Usage: const data = await apiJson<MyType>(url, options);
 */
export async function apiJson<T>(input: FetchInput, init?: ApiJsonOptions): Promise<T> {
    let url: string;
    if (typeof input === "string") {
        url = input;
    } else if (input instanceof URL) {
        url = input.toString();
    } else {
        throw new Error("apiJson expects a URL string/URL object; Request input is not supported. Pass the request URL string instead.");
    }

    let res: Response;
    if (init?.xTenantSlug) {
        res = await fetchProxy(url, init);
    } else {
        res = await fetchProxy(url, { ...init, tenantPolicy: "optional" });
    }

    if (init?.onResponse) {
        await init.onResponse(res);
    }

    if (res.ok) {
        const text = await res.text();
        if (!text) {
            throw new Error("Expected JSON body but received empty response");
        }
        try {
            return JSON.parse(text) as T;
        } catch {
            throw new Error(`Invalid JSON response: ${text.substring(0, 50)}`);
        }
    }

    // Handle Error Scenarios (Non-2xx)
    const text = await res.text();
    try {
        const json = JSON.parse(text);
        if (isAppError(json)) {
            throw json;
        }
        throw new HttpError({
            status: res.status,
            url,
            message: json.message || json.error || `HTTP ${res.status}`,
            bodyText: text,
            payload: json,
        });
    } catch (e) {
        if (isAppError(e)) throw e;
        // Fallback for non-JSON or parse error
        throw new HttpError({
            status: res.status,
            url,
            message: `HTTP ${res.status}`,
            bodyText: text || res.statusText,
        });
    }
}

/**
 * Authenticated wrapper for apiJson.
 * Injects token from cookies into Authorization header.
 * Default token is 'auth_token'.
 */
export async function apiJsonWithAuth<T>(
    url: string,
    init?: ApiJsonOptions,
    tokenName: "auth_token" | "customer_token" = "auth_token"
): Promise<T> {
    const cookieStore = await cookies();
    const token = cookieStore.get(tokenName);

    const headers = new Headers(init?.headers);
    if (token) {
        headers.set("Authorization", `Bearer ${token.value}`);
        // For legacy compatibility where some endpoints might expect cookie
        if (tokenName === "auth_token") {
            headers.set("Cookie", `auth_token=${token.value}`);
        }
    }

    return apiJson<T>(url, {
        ...init,
        headers,
        credentials: "include",
    });
}

/**
 * Raw authenticated fetch wrapper (no JSON parsing/assumption).
 * Use this for file uploads (FormData) or non-JSON responses.
 *
 * NOTE: Do NOT set Content-Type header if sending FormData (let fetch handle boundary).
 */
export async function apiFetchWithAuth(
    url: string,
    init?: RequestInit,
    tokenName: "auth_token" | "customer_token" = "auth_token"
): Promise<Response> {
    const cookieStore = await cookies();
    const token = cookieStore.get(tokenName);

    const headers = new Headers(init?.headers);
    if (token) {
        headers.set("Authorization", `Bearer ${token.value}`);
        // For legacy compatibility where some endpoints might expect cookie
        if (tokenName === "auth_token") {
            headers.set("Cookie", `auth_token=${token.value}`);
        }
    }

    // Explicitly ensure we don't mistakenly force Content-Type for FormData
    // (User is responsible for not setting it if body is FormData, but we can verify or just pass through)
    // We pass through init options directly.

    return fetchProxy(url, {
        ...init,
        headers,
        credentials: "include",
        tenantPolicy: "optional",
    });
}

/**
 * STRICT tenant-aware authenticated JSON fetch.
 * Requires explicit tenantSlug and injects x-tenant-slug header.
 * Use this for tenant-scoped endpoints to prevent context leaks.
 *
 * @throws Error if tenantSlug is empty or whitespace
 */
export async function apiJsonWithAuthTenant<T>(
    url: string,
    tenantSlug: string,
    init?: ApiJsonOptions,
    tokenName: "auth_token" | "customer_token" = "auth_token"
): Promise<T> {
    // Validate tenantSlug
    if (!tenantSlug || typeof tenantSlug !== "string" || tenantSlug.trim() === "") {
        throw new Error("tenantSlug required");
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(tokenName);

    const headers = new Headers(init?.headers);

    // Inject auth token (same logic as apiJsonWithAuth)
    if (token) {
        headers.set("Authorization", `Bearer ${token.value}`);
        if (tokenName === "auth_token") {
            headers.set("Cookie", `auth_token=${token.value}`);
        }
    }

    // FORCE override x-tenant-slug (anti-spoof)
    headers.set("x-tenant-slug", tenantSlug);

    return apiJson<T>(url, {
        ...init,
        headers,
        credentials: "include",
    });
}

/**
 * STRICT tenant-aware authenticated raw fetch.
 * Requires explicit tenantSlug and injects x-tenant-slug header.
 * Use this for tenant-scoped file uploads or non-JSON endpoints.
 *
 * @throws Error if tenantSlug is empty or whitespace
 */
export async function apiFetchWithAuthTenant(
    url: string,
    tenantSlug: string,
    init?: RequestInit,
    tokenName: "auth_token" | "customer_token" = "auth_token"
): Promise<Response> {
    // Validate tenantSlug
    if (!tenantSlug || typeof tenantSlug !== "string" || tenantSlug.trim() === "") {
        throw new Error("tenantSlug required");
    }

    const cookieStore = await cookies();
    const token = cookieStore.get(tokenName);

    const headers = new Headers(init?.headers);

    // Inject auth token (same logic as apiFetchWithAuth)
    if (token) {
        headers.set("Authorization", `Bearer ${token.value}`);
        if (tokenName === "auth_token") {
            headers.set("Cookie", `auth_token=${token.value}`);
        }
    }

    // FORCE override x-tenant-slug (anti-spoof)
    headers.set("x-tenant-slug", tenantSlug);

    return fetchProxy(url, {
        ...init,
        headers,
        credentials: "include",
        xTenantSlug: tenantSlug,
    });
}
