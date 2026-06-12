import { NextResponse } from "next/server";
import { fetchProxy } from "@/lib/data";
import { getBffBaseUrl } from "@/lib/bffBase";

export const runtime = "nodejs";

const BFF = getBffBaseUrl();

type Params = {
  provider: string;
  providerId: string;
};

export async function POST(req: Request, ctx: { params: Promise<Params> }) {
  const { provider, providerId } = await ctx.params;

  const url = new URL(req.url);
  const targetUrl = `${BFF}/webhooks/payments/${encodeURIComponent(provider)}/${encodeURIComponent(providerId)}${url.search}`;

  const headers = new Headers();
  const contentType = req.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);

  // Forward provider signature headers (keep it minimal and explicit).
  const xSign = req.headers.get("x-sign");
  if (xSign) headers.set("x-sign", xSign);

  const r = await fetchProxy(targetUrl, {
    method: "POST",
    headers,
    body: req.body,
    duplex: "half",
    cache: "no-store",
    tenantPolicy: "optional",
    public: true,
  });

  const body = await r.arrayBuffer();
  const res = new NextResponse(body, { status: r.status });
  const upstreamCt = r.headers.get("content-type");
  if (upstreamCt) res.headers.set("content-type", upstreamCt);
  return res;
}

