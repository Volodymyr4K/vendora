#!/usr/bin/env node
/* eslint-disable no-console */
import process from "node:process";
import fs from "node:fs/promises";

type Hit = { url: string; status: number; ok: boolean; ct: string; sample: string };

function arg(name: string): string | undefined {
  const i = process.argv.findIndex((x) => x === name);
  if (i >= 0) return process.argv[i + 1];
  return undefined;
}

function fill(tpl: string, params: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
}

async function tryFetchJson(url: string, init?: RequestInit): Promise<Hit | null> {
  try {
    const r = await fetch(url, { redirect: "follow", ...init });
    const ct = (r.headers.get("content-type") || "").toLowerCase();
    const text = await r.text();

    const looksJson = ct.includes("application/json") || ct.includes("+json") || text.trim().startsWith("{") || text.trim().startsWith("[");
    if (!looksJson) return null;

    // validate JSON
    JSON.parse(text);

    return {
      url,
      status: r.status,
      ok: r.ok,
      ct: ct || "?",
      sample: text.trim().slice(0, 180),
    };
  } catch {
    return null;
  }
}

async function pickFirst(base: string, candidates: string[], init?: RequestInit): Promise<Hit | null> {
  for (const path of candidates) {
    const url = base.replace(/\/$/, "") + path;
    const hit = await tryFetchJson(url, init);
    if (hit) return hit;
  }
  return null;
}

async function main() {
  const base = (arg("--base") || process.env.UPSTREAM_BASE_URL || "").replace(/\/$/, "");
  const branch = arg("--branch") || process.env.UPSTREAM_DISCOVERY_BRANCH_SLUG || "armashivka";
  const orderId = arg("--orderId") || "TEST_ORDER_ID";
  const save = arg("--save"); // path to write UPSTREAM_ENDPOINTS_JSON

  if (!base) {
    console.error("Usage: pnpm --filter @vendora/bff probe -- --base https://example.com [--branch armashivka] [--save ./endpoints.json]");
    process.exit(2);
  }

  // Candidate lists (safe + minimal). You can extend them if needed.
  const C = {
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
  } as const;

  const filled = (arr: string[]) => arr.map((p) => fill(p, { branch, orderId }));

  console.log("\n== Upstream Probe ==");
  console.log("Base:", base);
  console.log("Branch:", branch);

  const branches = await pickFirst(base, C.branches as unknown as string[]);
  const branchCfg = await pickFirst(base, filled(C.branch as any));
  const menu = await pickFirst(base, filled(C.menu as any));
  const delivery = await pickFirst(base, filled(C.delivery as any));

  // Quote/order are often POST/authorized; probe accepts non-2xx as long as JSON.
  const quote = await pickFirst(base, C.quote as unknown as string[], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ probe: true }) });
  const orderCreate = await pickFirst(base, C.orderCreate as unknown as string[], { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ probe: true }) });
  const orderStatus = await pickFirst(base, filled(C.orderStatus as any));

  const results = { branches, branch: branchCfg, menu, delivery, quote, orderCreate, orderStatus };

  function line(name: string, hit: Hit | null) {
    if (!hit) return `${name.padEnd(12)}: ❌ not found`;
    const badge = hit.ok ? "✅" : "⚠️";
    return `${name.padEnd(12)}: ${badge} ${hit.status} ${hit.url} (${hit.ct})`;
  }

  console.log(line("branches", branches));
  console.log(line("branch", branchCfg));
  console.log(line("menu", menu));
  console.log(line("delivery", delivery));
  console.log(line("quote", quote));
  console.log(line("orderCreate", orderCreate));
  console.log(line("orderStatus", orderStatus));

  const endpoints: any = {};
  if (branches) endpoints.branches = branches.url.replace(base, "");
  if (branchCfg) endpoints.branch = branchCfg.url.replace(base, "").replace(branch, "{branch}");
  if (menu) endpoints.menu = menu.url.replace(base, "").replace(branch, "{branch}");
  if (delivery) endpoints.delivery = delivery.url.replace(base, "").replace(branch, "{branch}");
  if (quote) endpoints.quote = quote.url.replace(base, "");
  if (orderCreate) endpoints.orderCreate = orderCreate.url.replace(base, "");
  if (orderStatus) endpoints.orderStatus = orderStatus.url.replace(base, "").replace(orderId, "{orderId}");

  console.log("\nSuggested UPSTREAM_ENDPOINTS_JSON:");
  console.log(JSON.stringify(endpoints, null, 2));

  if (save) {
    await fs.writeFile(save, JSON.stringify(endpoints, null, 2), "utf-8");
    console.log("\nSaved:", save);
  }

  // Exit code: success if at least core endpoints are found
  const okCore = Boolean(endpoints.branches && endpoints.menu && endpoints.delivery);
  process.exit(okCore ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
