import type { QuoteResponse, OrderCreateRequest } from "@vendora/contracts";
import { fetchWithTimeout } from "./fetchClient";

export class ApiError extends Error {
    public status: number;
    public data: unknown;

    constructor(status: number, data: unknown) {
        const errorData = data as { message?: string; error?: string } | null;
        const message = errorData?.message || errorData?.error || `Request failed with status ${status}`;
        super(message);
        this.name = "ApiError";
        this.status = status;
        this.data = data;
    }
}

interface QuoteRequest {
    branchSlug: string;
    items: { id: string; qty: number }[];
}

interface QuoteError {
    error: string;
    [key: string]: unknown;
}



interface QuoteOptions {
    timeoutMs?: number;
}

/**
 * Calculates the cart quote (client-side fetch wrapper)
 */
export async function quoteCheckout(data: QuoteRequest, options?: QuoteOptions): Promise<QuoteResponse> {
    const timeoutMs = options?.timeoutMs ?? 8000;

    const res = await fetchWithTimeout("/api/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    }, timeoutMs);

    const json = (await res.json()) as QuoteResponse | QuoteError;

    if (!res.ok) {
        throw new ApiError(res.status, json);
    }

    // Legacy/Backend check: sometimes 200 OK returns { error: "..." }
    if ((json as QuoteError).error) {
        throw new Error((json as QuoteError).error);
    }

    return json as QuoteResponse;
}

interface CreateOrderOptions {
    idempotencyKey?: string;
    timeoutMs?: number;
}

/**
 * Creates an order (client-side fetch wrapper)
 */
export async function createOrder(
    data: OrderCreateRequest,
    options?: CreateOrderOptions
): Promise<{ token: string; paymentUrl?: string }> {
    const headers: HeadersInit = {
        "Content-Type": "application/json",
    };

    if (options?.idempotencyKey) {
        headers["idempotency-key"] = options.idempotencyKey;
    }

    const timeoutMs = options?.timeoutMs ?? 12000;

    const res = await fetchWithTimeout("/api/order", {
        method: "POST",
        headers,
        body: JSON.stringify(data),
    }, timeoutMs);

    const json = await res.json();

    if (!res.ok) {
        throw new ApiError(res.status, json);
    }

    return json;
}
