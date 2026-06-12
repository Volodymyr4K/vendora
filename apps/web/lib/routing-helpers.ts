import type { RoutingContext } from "./routing-types";

function normalizePath(path: string): string {
  if (!path) return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function storefrontHref(
  ctx: RoutingContext,
  path: string,
  opts?: { explicitBranchSlug?: string }
): string {
  const normalized = normalizePath(path);
  const explicitBranch = opts?.explicitBranchSlug;
  const branch = explicitBranch || ctx.branchSlug;

  if (ctx.kind === "domain") {
    if (ctx.mode === "default") {
      return normalized;
    }
    if (branch) {
      return `/${branch}${normalized}`;
    }
    return "/choose-city";
  }

  if (ctx.tenantSlug && branch) {
    return `/t/${ctx.tenantSlug}/${branch}${normalized}`;
  }
  if (ctx.tenantSlug) {
    return `/t/${ctx.tenantSlug}/choose-city`;
  }
  return normalized;
}

export function tenantHref(ctx: RoutingContext, path: string): string {
  const normalized = normalizePath(path);
  if (ctx.kind === "domain") {
    // Canonical home for custom domains is `/` (not `/main`).
    if (normalized === "/main") return "/";
    return normalized;
  }
  if (ctx.tenantSlug) {
    return `/t/${ctx.tenantSlug}${normalized}`;
  }
  return normalized;
}
