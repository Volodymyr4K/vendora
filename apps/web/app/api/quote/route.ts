import { NextResponse } from "next/server";
import { fetchProxy } from "../../../lib/data";
import { getBffBaseUrl } from "@/lib/bffBase";

const BFF = getBffBaseUrl();

export async function POST(req: Request) {
  const body = await req.text();
  const headers = new Headers();
  headers.set("content-type", "application/json");

  // Forward critical headers (Tenant Context + Auth)
  const tenantSlug = req.headers.get("x-tenant-slug");
  if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);

  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const r = await fetchProxy(`${BFF}/cart/quote`, {
    method: "POST",
    headers,
    body,
    cache: "no-store",
    xTenantSlug: tenantSlug ?? undefined,
  });

  const text = await r.text();
  const res = new NextResponse(text, { status: r.status });
  res.headers.set("content-type", "application/json");
  const xc = r.headers.get("x-cache");
  const xa = r.headers.get("x-cache-age");
  if (xc) res.headers.set("x-cache", xc);
  if (xa) res.headers.set("x-cache-age", xa);
  return res;
}
