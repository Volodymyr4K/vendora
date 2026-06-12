import { NextResponse } from "next/server";
import { fetchProxy } from "../../../../lib/data";
import { getBffBaseUrl } from "@/lib/bffBase";

const BFF = getBffBaseUrl();

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const { token } = await ctx.params;

  const headers = new Headers();
  headers.set("content-type", "application/json");

  // Forward critical headers (Tenant Context + Auth)
  const tenantSlug = req.headers.get("x-tenant-slug");
  if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);

  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const r = await fetchProxy(`${BFF}/orders/${token}`, {
    headers,
    cache: "no-store",
    xTenantSlug: tenantSlug ?? undefined,
  });
  const text = await r.text();
  const res = new NextResponse(text, { status: r.status });
  res.headers.set("content-type", "application/json");
  return res;
}
