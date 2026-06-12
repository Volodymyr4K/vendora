import { revalidateTag as nextRevalidateTag } from "next/cache";

export const tagSlug = (s: string) => encodeURIComponent(s);
export const tenantTag = (tenantSlug: string) => `tenant:${tagSlug(tenantSlug)}`;
export const menuTenantTag = (tenantSlug: string, locale?: string) =>
  `menu:tenant:${tagSlug(tenantSlug)}${locale ? `:locale:${tagSlug(locale)}` : ""}`;
export const menuTag = (tenantSlug: string, branchSlug: string, locale?: string) =>
  `menu:tenant:${tagSlug(tenantSlug)}:branch:${tagSlug(branchSlug)}${locale ? `:locale:${tagSlug(locale)}` : ""}`;

/**
 * Wrapper: keeps backward-compat signature, but uses canonical Next call.
 * Second arg is accepted (for legacy call sites) but intentionally unused.
 */
export function revalidateTag(tag: string, _unused?: unknown): void {
    void _unused;
    // Next.js 16+ types require 2 args, but runtime accepts 1
    // Use type assertion to call with canonical single-arg signature
    (nextRevalidateTag as (tag: string) => void)(tag);
}
