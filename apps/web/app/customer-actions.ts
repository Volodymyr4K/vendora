"use server";

import { getTenantConfig } from "@/lib/data";
import { apiJson, apiJsonWithAuth } from "@/lib/server/api";
import { getBffBaseUrl } from "@/lib/bffBase";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import {
    zCustomerAuthResponse,
    zCustomerProfile,
    zCustomerAddressResponse,
    zCustomerAddressCreate,
    zCustomerOrderHistoryResponse,
    zCustomerAddressDeleteResponse,
    zCustomerUpdateProfile
} from "@vendora/contracts";
import { z } from "zod";

const BFF = getBffBaseUrl();

// AUTH
export async function requestOtpAction(phone: string, tenantSlug: string) {
    // We pass tenantSlug manually to ensure context
    // This is public, so basic apiJson
    return apiJson<boolean>(`${BFF}/auth/customer/otp`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-tenant-slug": tenantSlug
        },
        body: JSON.stringify({ phone })
    }).then(() => true);
}

export async function verifyOtpAction(phone: string, code: string, tenantSlug: string) {
    // This sets cookie on success. Token is in body.
    // We use apiJson to get data, then set cookie.
    const data = await apiJson<z.infer<typeof zCustomerAuthResponse>>(`${BFF}/auth/customer/verify`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "x-tenant-slug": tenantSlug
        },
        body: JSON.stringify({ phone, code })
    });

    // Handle success logic here since token is in BODY
    (await cookies()).set("customer_token", data.token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 30 * 24 * 3600 // 30 days
    });
    return data.customer;
}
// Wait, my instruction above is messy. If token is in body, I don't need onResponse. I just use return value.
// BUT verifyOtpAction returns `data.customer`, not `data`.
// So `apiJson` returns `data`. Then I use `data`.

export async function logoutCustomerAction() {
    (await cookies()).delete("customer_token");
}



// PROFILE
export async function getCustomerProfileAction(tenantSlug: string) {
    try {
        return await apiJsonWithAuth<z.infer<typeof zCustomerProfile>>(`${BFF}/customer/me`, { headers: { "x-tenant-slug": tenantSlug } }, "customer_token");
    } catch (e) {
        return null; // Not logged in or error
    }
}

export async function updateCustomerProfileAction(data: z.infer<typeof zCustomerUpdateProfile>, tenantSlug: string) {
    const res = await apiJsonWithAuth<z.infer<typeof zCustomerProfile>>(`${BFF}/customer/me`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-tenant-slug": tenantSlug },
        body: JSON.stringify(data)
    }, "customer_token");
    revalidatePath(`/t/${tenantSlug}/profile`);
    return res;
}

// ADDRESSES
export async function getCustomerAddressesAction(tenantSlug: string) {
    return await apiJsonWithAuth<z.infer<typeof zCustomerAddressResponse>[]>(`${BFF}/customer/addresses`, { headers: { "x-tenant-slug": tenantSlug } }, "customer_token");
}

export async function addCustomerAddressAction(data: z.infer<typeof zCustomerAddressCreate>, tenantSlug: string) {
    const res = await apiJsonWithAuth<z.infer<typeof zCustomerAddressResponse>>(`${BFF}/customer/addresses`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-tenant-slug": tenantSlug },
        body: JSON.stringify(data)
    }, "customer_token");
    revalidatePath(`/t/${tenantSlug}/profile`);
    return res;
}

export async function deleteCustomerAddressAction(id: string, tenantSlug: string) {
    await apiJsonWithAuth<z.infer<typeof zCustomerAddressDeleteResponse>>(`${BFF}/customer/addresses/${id}`, {
        method: "DELETE",
        headers: { "x-tenant-slug": tenantSlug }
    }, "customer_token");
    revalidatePath(`/t/${tenantSlug}/profile`);
}

// ORDERS
export async function getCustomerOrdersAction(tenantSlug: string) {
    return await apiJsonWithAuth<z.infer<typeof zCustomerOrderHistoryResponse>>(`${BFF}/customer/orders`, { headers: { "x-tenant-slug": tenantSlug } }, "customer_token");
}

/** Fetches tenant config via canonical helper (lib/data.ts). V1: no-store only; no tags/revalidate. */
export async function getTenantConfigAction(tenantSlug: string) {
    return getTenantConfig(tenantSlug);
}
