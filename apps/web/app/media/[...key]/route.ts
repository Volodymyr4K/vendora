import { getBffBaseUrl } from "@/lib/bffBase";

const PASSTHROUGH_HEADERS = [
  "content-type",
  "cache-control",
  "etag",
  "last-modified",
] as const;

function buildUpstreamUrl(keyPath: string): string {
  const bff = getBffBaseUrl();
  const safe = keyPath.startsWith("/") ? keyPath : `/${keyPath}`;
  return `${bff}/media${safe}`;
}

function parsePrimaryHost(raw: string | null): string | null {
  if (!raw) return null;
  const primary = raw.split(",")[0]?.trim();
  if (!primary) return null;
  const hostPart = primary.split(":")[0]?.trim();
  return hostPart ? hostPart.toLowerCase() : null;
}

function isLocalHost(host: string): boolean {
  return host === "localhost" || host === "127.0.0.1" || host === "0.0.0.0" || host.endsWith(".localhost");
}

function inferTenantSlugFromKey(key: string[]): string | null {
  // Expected object key form: /media/t/<tenantSlug>/...
  if (key.length < 2) return null;
  if (key[0] !== "t") return null;
  const slug = key[1] || "";
  if (!/^[a-z0-9-]+$/.test(slug)) return null;
  return slug;
}

function pickHeaders(source: Headers): Headers {
  const headers = new Headers();
  for (const name of PASSTHROUGH_HEADERS) {
    const v = source.get(name);
    if (v) headers.set(name, v);
  }
  return headers;
}

async function proxyMedia(req: Request, params: Promise<{ key: string[] }>) {
  const { key } = await params;
  const keyPath = "/" + key.map(encodeURIComponent).join("/");
  const url = buildUpstreamUrl(keyPath);

  const requestHeaders = new Headers();
  // Tenant resolution in BFF media route uses x-forwarded-host/host.
  // For requests initiated by Next's image optimizer, the internal fetch host can be `localhost`,
  // which breaks tenant resolution for custom domains. In that case, derive the tenant from the key.
  const forwarded = req.headers.get("x-forwarded-host");
  const host = req.headers.get("host");
  const primaryHost = parsePrimaryHost(forwarded) ?? parsePrimaryHost(host);

  if (primaryHost && !isLocalHost(primaryHost)) {
    requestHeaders.set("x-forwarded-host", primaryHost);
  } else {
    const tenantSlug = inferTenantSlugFromKey(key);
    if (tenantSlug) {
      const baseDomain = (process.env.BASE_DOMAIN || "vendora.local").trim();
      requestHeaders.set("x-forwarded-host", `${tenantSlug}.${baseDomain}`);
    }
  }
  const ifNoneMatch = req.headers.get("if-none-match");
  if (ifNoneMatch) requestHeaders.set("if-none-match", ifNoneMatch);

  const upstream = await fetch(url, {
    method: req.method,
    headers: requestHeaders,
    cache: "no-store",
  });

  const headers = pickHeaders(upstream.headers);
  return new Response(req.method === "HEAD" ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  return proxyMedia(req, ctx.params);
}

export async function HEAD(req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  return proxyMedia(req, ctx.params);
}
