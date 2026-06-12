import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "../config.js";
import { discoverUpstreamEndpoints } from "../services/discovery.js";
import { fetchJson } from "../services/http.js";
import { normalizeBranches, normalizeMenu, normalizeDelivery } from "../services/normalize/index.js";

async function main() {
  const cfg = loadConfig(process.env);

  if (cfg.UPSTREAM_MODE !== "http") {
    console.error("UPSTREAM_MODE must be http for capture");
    process.exit(1);
  }
  if (!cfg.UPSTREAM_BASE_URL) {
    console.error("UPSTREAM_BASE_URL is required");
    process.exit(1);
  }

  const base = cfg.UPSTREAM_BASE_URL.replace(/\/$/, "");
  let endpoints = cfg.upstreamEndpoints;

  // If endpoints not provided, try discovery
  if (!cfg.upstreamEndpointsProvided || cfg.UPSTREAM_DISCOVERY_ENABLED) {
    const candidates = cfg.UPSTREAM_DISCOVERY_CANDIDATES_JSON;

    const discovered = await discoverUpstreamEndpoints({
      baseUrl: base,
      branchSlug: cfg.UPSTREAM_DISCOVERY_BRANCH_SLUG,
      timeoutMs: cfg.UPSTREAM_DISCOVERY_TIMEOUT_MS,
      candidates: candidates as any,
    });
    endpoints = { ...endpoints, ...(discovered.endpoints || {}) };
    console.log("discovery:", discovered);
  }

  const outDir = ".cache/snapshots";
  fs.mkdirSync(outDir, { recursive: true });

  async function grab(op: string, url: string, init?: RequestInit) {
    console.log("GET", op, url);
    
    // Extract x-tenant-slug from cfg.upstreamHeaders (case-insensitive)
    const base = cfg.upstreamHeaders ?? {};
    let tenantSlug: string | undefined;
    for (const [key, value] of Object.entries(base)) {
      if (key.toLowerCase() === "x-tenant-slug") {
        tenantSlug = value;
        break;
      }
    }
    
    // Validate tenantSlug is present and non-empty
    if (!tenantSlug || tenantSlug.trim() === "") {
      throw new Error("Missing x-tenant-slug in cfg.upstreamHeaders for capture tool");
    }
    
    // Build headers object: copy all except x-tenant-slug variants, then set canonical key
    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(base)) {
      if (key.toLowerCase() !== "x-tenant-slug") {
        headers[key] = value;
      }
    }
    headers["x-tenant-slug"] = tenantSlug;
    
    const raw = await fetchJson(url, {
      timeoutMs: cfg.REQUEST_TIMEOUT_MS,
      retries: 0,
      backoffMs: cfg.RETRY_BACKOFF_MS,
      headers,
      requestId: `capture-${op}`,
      op,
    }, init);
    fs.writeFileSync(path.join(outDir, `${op}.json`), JSON.stringify(raw, null, 2), "utf8");
    return raw;
  }

  const branchSlug = cfg.UPSTREAM_DISCOVERY_BRANCH_SLUG;

  const rawBranches = await grab("branches", base + endpoints.branches);
  const branches = normalizeBranches(rawBranches, { unwrapKeys: cfg.upstreamUnwrapKeys });
  fs.writeFileSync(path.join(outDir, `branches.normalized.json`), JSON.stringify(branches, null, 2), "utf8");

  const rawBranch = await grab("branch", base + endpoints.branch.replace("{branch}", encodeURIComponent(branchSlug)));
  fs.writeFileSync(path.join(outDir, `branch.json`), JSON.stringify(rawBranch, null, 2), "utf8");

  const rawMenu = await grab("menu", base + endpoints.menu);
  const menu = cfg.UPSTREAM_ADAPTER === "passthrough"
    ? rawMenu
    : normalizeMenu(rawMenu, { baseUrl: cfg.UPSTREAM_BASE_URL, unwrapKeys: cfg.upstreamUnwrapKeys });
  fs.writeFileSync(path.join(outDir, `menu.normalized.json`), JSON.stringify(menu, null, 2), "utf8");

  const rawDelivery = await grab("delivery", base + endpoints.delivery.replace("{branch}", encodeURIComponent(branchSlug)));
  const delivery = cfg.UPSTREAM_ADAPTER === "passthrough"
    ? rawDelivery
    : normalizeDelivery(rawDelivery, { unwrapKeys: cfg.upstreamUnwrapKeys });
  fs.writeFileSync(path.join(outDir, `delivery.normalized.json`), JSON.stringify(delivery, null, 2), "utf8");

  console.log("✅ snapshots saved to", outDir);
}

main().catch((e) => {
  console.error("capture failed:", e);
  process.exit(1);
});
