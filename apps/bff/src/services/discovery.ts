import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export type DiscoveryHit = {
  url: string;
  status: number;
  ok: boolean;
  contentType: string;
  sample: string;
};

export type UpstreamCandidates = {
  branches: string[];
  branch: string[];
  menu: string[];
  delivery: string[];
  quote: string[];
  orderCreate: string[];
  orderStatus: string[];
};

export type DiscoveredEndpoints = Partial<{
  branches: string;
  branch: string;
  menu: string;
  delivery: string;
  quote: string;
  orderCreate: string;
  orderStatus: string;
}>;

export type DiscoveryReport = {
  baseUrl: string;
  branchSlug: string;
  tookMs: number;
  hits: Partial<Record<keyof UpstreamCandidates, DiscoveryHit>>;
  endpoints: DiscoveredEndpoints;
};

function fill(tpl: string, params: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
}

function looksJson(ct: string, text: string) {
  const t = text.trim();
  return (
    ct.includes("application/json") ||
    ct.includes("+json") ||
    t.startsWith("{") ||
    t.startsWith("[")
  );
}

async function tryFetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<DiscoveryHit | null> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { redirect: "follow", signal: ac.signal, ...init });
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const text = await r.text();
    if (!looksJson(ct, text)) return null;

    // If it parses as JSON, we accept it even if status is 401/403/405.
    try {
      JSON.parse(text);
    } catch {
      return null;
    }

    return {
      url,
      status: r.status,
      ok: r.ok,
      contentType: ct || "?",
      sample: text.trim().slice(0, 180),
    };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function pickFirst(
  base: string,
  candidates: string[],
  init: RequestInit,
  timeoutMs: number
): Promise<DiscoveryHit | null> {
  for (const p of candidates) {
    const url = base.replace(/\/$/, "") + p;
    const hit = await tryFetchJson(url, init, timeoutMs);
    if (hit) return hit;
  }
  return null;
}

export function defaultCandidates(): UpstreamCandidates {
  return {
    branches: [
      "/branches",
      "/api/branches",
      "/api/v1/branches",
      "/api/public/branches",
      "/api/v1/public/branches",
      "/api/branch/list",
      "/api/v1/branch/list",
    ],
    branch: [
      "/branches/{branch}",
      "/api/branches/{branch}",
      "/api/v1/branches/{branch}",
      "/api/public/branches/{branch}",
      "/api/v1/public/branches/{branch}",
    ],
    menu: [
      "/menu",
      "/api/menu",
      "/api/v1/menu",
      "/api/public/menu",
      "/api/v1/public/menu",
      "/api/menu/{branch}",
      "/api/v1/menu/{branch}",
      "/api/branches/{branch}/menu",
      "/api/v1/branches/{branch}/menu",
      "/api/catalog",
      "/api/v1/catalog",
    ],
    delivery: [
      "/delivery/{branch}",
      "/api/delivery/{branch}",
      "/api/v1/delivery/{branch}",
      "/api/branches/{branch}/delivery",
      "/api/v1/branches/{branch}/delivery",
    ],
    quote: [
      "/cart/quote",
      "/api/cart/quote",
      "/api/v1/cart/quote",
      "/api/quote",
      "/api/v1/quote",
      "/checkout/quote",
    ],
    orderCreate: [
      "/orders",
      "/api/orders",
      "/api/v1/orders",
      "/api/order",
      "/api/v1/order",
      "/checkout/order",
      "/api/checkout/order",
    ],
    orderStatus: [
      "/orders/{orderId}",
      "/api/orders/{orderId}",
      "/api/v1/orders/{orderId}",
      "/api/order/{orderId}",
      "/api/v1/order/{orderId}",
    ],
  };
}

export async function discoverUpstreamEndpoints(args: {
  baseUrl: string;
  branchSlug: string;
  orderId?: string;
  timeoutMs: number;
  candidates?: UpstreamCandidates;
}): Promise<DiscoveryReport> {
  const t0 = Date.now();
  const base = args.baseUrl.replace(/\/$/, "");
  const branch = args.branchSlug;
  const orderId = args.orderId || "TEST_ORDER_ID";
  const C = args.candidates || defaultCandidates();

  const filled = (arr: string[]) => arr.map((p) => fill(p, { branch, orderId }));

  const branches = await pickFirst(base, C.branches, { method: "GET" }, args.timeoutMs);
  const branchCfg = await pickFirst(base, filled(C.branch), { method: "GET" }, args.timeoutMs);
  const menu = await pickFirst(base, filled(C.menu), { method: "GET" }, args.timeoutMs);
  const delivery = await pickFirst(base, filled(C.delivery), { method: "GET" }, args.timeoutMs);

  // Quote/order are frequently POST and sometimes return JSON errors — we still accept JSON.
  const quote = await pickFirst(
    base,
    C.quote,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probe: true }),
    },
    args.timeoutMs
  );
  const orderCreate = await pickFirst(
    base,
    C.orderCreate,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ probe: true }),
    },
    args.timeoutMs
  );
  const orderStatus = await pickFirst(base, filled(C.orderStatus), { method: "GET" }, args.timeoutMs);

  const endpoints: DiscoveredEndpoints = {};
  if (branches) endpoints.branches = branches.url.replace(base, "");
  if (branchCfg) endpoints.branch = branchCfg.url.replace(base, "").replace(branch, "{branch}");
  if (menu) endpoints.menu = menu.url.replace(base, "").replace(branch, "{branch}");
  if (delivery) endpoints.delivery = delivery.url.replace(base, "").replace(branch, "{branch}");
  if (quote) endpoints.quote = quote.url.replace(base, "");
  if (orderCreate) endpoints.orderCreate = orderCreate.url.replace(base, "");
  if (orderStatus) endpoints.orderStatus = orderStatus.url.replace(base, "").replace(orderId, "{orderId}");

  return {
    baseUrl: base,
    branchSlug: branch,
    tookMs: Date.now() - t0,
    hits: {
      branches: branches || undefined,
      branch: branchCfg || undefined,
      menu: menu || undefined,
      delivery: delivery || undefined,
      quote: quote || undefined,
      orderCreate: orderCreate || undefined,
      orderStatus: orderStatus || undefined,
    },
    endpoints,
  };
}

export async function writeDiscoveryFile(savePath: string, endpoints: DiscoveredEndpoints) {
  const dir = path.dirname(savePath);
  await mkdir(dir, { recursive: true });
  await writeFile(savePath, JSON.stringify(endpoints, null, 2), "utf-8");
}
