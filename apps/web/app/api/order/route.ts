import { NextResponse } from "next/server";
import { fetchProxy } from "../../../lib/data";
import { getBffBaseUrl } from "@/lib/bffBase";

const BFF = getBffBaseUrl();

export async function POST(req: Request) {
  // 1. Remove buffering: const body = await req.text();
  const idem = req.headers.get("idempotency-key") || req.headers.get("x-idempotency-key") || "";

  const headers = new Headers();
  headers.set("content-type", "application/json");
  if (idem) headers.set("idempotency-key", idem);

  // Forward critical headers (Tenant Context + Auth)
  const tenantSlug = req.headers.get("x-tenant-slug");
  if (tenantSlug) headers.set("x-tenant-slug", tenantSlug);

  const cookie = req.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);

  const auth = req.headers.get("authorization");
  if (auth) headers.set("authorization", auth);

  const r = await fetchProxy(`${BFF}/orders`, {
    method: "POST",
    headers,
    body: req.body,
    duplex: "half",
    cache: "no-store",
    xTenantSlug: tenantSlug ?? undefined,
  });

  const text = await r.text();
  const res = new NextResponse(text, { status: r.status });
  res.headers.set("content-type", "application/json");
  const key = r.headers.get("x-idempotency-key");
  const replay = r.headers.get("x-idempotent-replay");
  if (key) res.headers.set("x-idempotency-key", key);
  if (replay) res.headers.set("x-idempotent-replay", replay);
  return res;
}
