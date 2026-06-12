"use server";

import { cookies, headers } from "next/headers";
import type { CheckoutInitRequest, CheckoutConfirmRequest, CheckoutInitResponse, CheckoutConfirmResponse } from "@vendora/contracts";
// isAppError Removed: Unused after migration using apiJson helpers

import { apiJson } from "@/lib/server/api";

import { getBffBaseUrl } from "@/lib/bffBase";

const BFF_URL = getBffBaseUrl();

async function getHeaders() {
    const c = await cookies();
    const h = await headers();
    const reqHeaders: Record<string, string> = {
        "Content-Type": "application/json",
    };
    const token = c.get("customer_token");
    if (token) reqHeaders["Authorization"] = `Bearer ${token.value}`;

    // Middleware injects 'x-tenant-slug' into HEADERS, not cookies
    const tenantSlug = h.get("x-tenant-slug");
    if (tenantSlug) reqHeaders["x-tenant-slug"] = tenantSlug;

    return reqHeaders;
}

// Local Helper Removed: replaced by apiJson


import { isAppError } from "@/lib/errors";
import type { AppError } from "@vendora/contracts";

export type CheckoutInitResult =
    | { ok: true; data: CheckoutInitResponse }
    | { ok: false; error: AppError };

export async function checkoutInitAction(data: CheckoutInitRequest): Promise<CheckoutInitResult> {
    const headers = await getHeaders();
    try {
        const res = await apiJson<CheckoutInitResponse>(`${BFF_URL}/checkout/init`, {
            method: "POST",
            headers,
            body: JSON.stringify(data),
            cache: "no-store",
        });
        return { ok: true, data: res };
    } catch (err) {
        if (isAppError(err)) {
            return { ok: false, error: err };
        }
        throw err;
    }
}

// Update signature to accept optional idempotencyKey
export async function checkoutConfirmAction(
    data: CheckoutConfirmRequest,
    idempotencyKey?: string     // NEW: Optional key from client
): Promise<CheckoutConfirmResponse> {
    const headers = await getHeaders();

    // 1. Inject Idempotency Key if provided
    if (idempotencyKey) {
        headers["idempotency-key"] = idempotencyKey;
    }

    return apiJson<CheckoutConfirmResponse>(`${BFF_URL}/checkout/confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify(data),
        cache: "no-store",
        onResponse: async (res) => {
            if (res.ok) {
                const setCookie = res.headers.get("set-cookie");
                if (setCookie) {
                    const match = setCookie.match(/customer_token=([^;]+)/);
                    if (match && match[1]) {
                        const tokenVal = match[1];
                        const c = await cookies();
                        c.set("customer_token", tokenVal, {
                            httpOnly: true,
                            secure: process.env.NODE_ENV === "production",
                            path: "/",
                            maxAge: 30 * 24 * 3600
                        });
                    }
                }
            }
        }
    });
}

export async function getTimeSlotsAction(branchSlug: string, tenantSlug: string) {
    const { getTimeSlots } = await import("@/lib/data");
    return await getTimeSlots(branchSlug, tenantSlug);
}
