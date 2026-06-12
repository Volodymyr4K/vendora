import { NextResponse } from "next/server";
import { fetchProxy } from "../../../../lib/data";
import { getBffBaseUrl } from "@/lib/bffBase";

const BFF = getBffBaseUrl();

export async function POST(req: Request) {
    const body = await req.json();
    const tenantSlug = req.headers.get("x-tenant-slug");

    const headers = new Headers();
    headers.set("content-type", "application/json");
    if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);

    // Proxy to BFF
    const r = await fetchProxy(`${BFF}/orders/test-confirm`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        cache: "no-store",
        xTenantSlug: tenantSlug ?? undefined,
    });

    const json = await r.json();
    return NextResponse.json(json, { status: r.status });
}
