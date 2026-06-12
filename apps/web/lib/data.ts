import 'server-only';
import { getBffBaseUrl } from "@/lib/bffBase";
import type { z } from "zod";
import type { AmContentV1 } from "@/lib/am-content";
import {
  zBranchConfig,
  zStorefrontConfig,
  zMenuCategoryPayload, // NEW
  zMenuItem, // NEW
  zMenuCategorySummaryPayload,
  zMenuItemsPayload,
  zMenuResponse,
  zDeliveryResponse,
  zOrderListResponse,
  zTimeSlotsResponse,
  zDashboardStats,
  zBranchSettings,
  // Admin Types
  BranchSettings,
  DashboardStats,
  TimeSlotsResponse,
  zBranchList,
  zBranchListItem,
} from "@vendora/contracts";
import type { AdminModuleId } from "@vendora/contracts";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import { toError } from "./errors";
import { logger } from "./logger";
import { tagSlug, tenantTag, menuTag, menuTenantTag } from "@/lib/cache/tagSlug";
import { AM_CONTENT_DEFAULTS } from "@/lib/am-content-defaults";



const BFF = getBffBaseUrl();

// Extended RequestInit to include Next.js specific options (e.g. revalidate tags)
interface FetchOptions extends RequestInit {
  xTenantSlug?: string;
  tenantPolicy?: 'strict' | 'optional';
  public?: boolean;
}

export interface ProxyFetchOptions extends FetchOptions {
  // Allow passing duplex for streaming (Node.js/Next.js specific)
  duplex?: 'half';
}

export type StorefrontConfig = z.infer<typeof zStorefrontConfig> & {
  amContent?: AmContentV1;
};

export class FetchJsonError extends Error {
  name = "FetchJsonError";
  status?: number;
  url: string;
  method: string;
  requestId?: string;
  bodySnippet?: string;
  constructor(message: string, args: { url: string; method: string; status?: number; requestId?: string; bodySnippet?: string; cause?: unknown }) {
    super(message, { cause: args.cause });
    this.status = args.status;
    this.url = args.url;
    this.method = args.method;
    this.requestId = args.requestId;
    this.bodySnippet = args.bodySnippet;
  }
}

export async function fetchProxy(url: string, init?: ProxyFetchOptions): Promise<Response> {
  const augmented = await augmentInit(url, init);
  return fetch(url, augmented);
}

export async function fetchJsonStrict<T = unknown>(url: string, init?: FetchOptions, timeoutMs = 4500): Promise<T> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const finalInit = await augmentInit(url, init);
    const method = finalInit.method || 'GET';
    const r = await fetch(url, { ...finalInit, signal: ac.signal }).catch(err => {
      const e = toError(err);
      throw new FetchJsonError("Network/Fetch Error", { url, method, cause: e });
    });

    if (!r) throw new FetchJsonError("No response (Network error)", { url, method });

    const text = await r.text().catch(err => {
      throw new FetchJsonError("Failed to read response body", { url, method, cause: err });
    });

    if (!r.ok) {
      const bodySnippet = text.slice(0, 800);
      throw new FetchJsonError("Upstream request failed", { url, method, status: r.status, bodySnippet });
    }

    try {
      return JSON.parse(text) as T;
    } catch (e) {
      throw new FetchJsonError("Invalid JSON from upstream", { url, method, cause: e });
    }
  } catch (err) {
    if (err instanceof FetchJsonError) throw err;

    const e = toError(err);
    const method = init?.method || 'GET';

    if (e.name === 'AbortError') {
      throw new FetchJsonError("Upstream request timeout", { url, method, cause: e });
    } else {
      throw new FetchJsonError("Network/Fetch Error", { url, method, cause: e });
    }
  } finally {
    clearTimeout(t);
  }
}

// Helper to inject cookies and tenant context if on server
async function augmentInit(url: string, init?: RequestInit): Promise<RequestInit> {
  const newInit = { ...init };
  if (typeof window === "undefined") {
    try {
      const { cookies, headers: nextHeaders } = await import("next/headers");
      const cookieStore = await cookies();
      const headerStore = await nextHeaders();

      const headers = new Headers(newInit.headers);

      const isPublic = (newInit as FetchOptions).public === true;

      // Forward auth token (unless explicitly public)
      if (!isPublic) {
        const token = cookieStore.get("auth_token");
        if (token) {
          headers.set("Cookie", `auth_token=${token.value}`);
        }
      }

      // [Phase 1G] Context Propagation & Anti-Spoofing
      // 1. Trace ID: Forward x-request-id for log correlation (Cache Safe)
      const requestId = headerStore.get("x-request-id");
      if (requestId) {
        headers.set("x-request-id", requestId);
      }

      // 2. Tenant Context: Explicit > Implicit > Fail
      // [Refinement] "Explicit Argument" is King. "Headers" is Plan B (Warn).

      const explicitTenantSlug = (newInit as FetchOptions).xTenantSlug;
      const headerTenantSlug = headerStore.get("x-tenant-slug") || undefined;
      let tenantSlug = explicitTenantSlug || headerTenantSlug;

      // Service-domain fallback: allow a default tenant for health checks / service host
      if (!tenantSlug) {
        const host = (headerStore.get("host") || "").toLowerCase();
        const serviceHost = (process.env.SERVICE_DOMAIN || "").toLowerCase();
        const serviceSuffix = (process.env.SERVICE_DOMAIN_SUFFIX || "").toLowerCase();
        const isServiceDomain =
          host === "localhost:3000" ||
          host.endsWith(".localhost:3000") ||
          host.endsWith(".localhost") ||
          (serviceHost && host === serviceHost) ||
          (serviceSuffix && host.endsWith(serviceSuffix));

        const defaultTenant = process.env.DEFAULT_TENANT_SLUG;
        if (isServiceDomain && defaultTenant) {
          tenantSlug = defaultTenant;
        }
      }

      // 3. Fail Fast Protocol check
      // Only strictly enforce if we are hitting BFF endpoints (we assume augmentInit is mostly for that).
      // We can't easily check URL here.
      // BUT if we don't have a slug, and we are sending to BFF, BFF will return 400.
      // Do we throw here to save the network call? Yes, "Anti-Leak".

      if (tenantSlug) {
        headers.set("x-tenant-slug", tenantSlug);
      } else {
        // Case C: Missing Context
        // Check Policy
        const policy = (newInit as FetchOptions).tenantPolicy || 'strict';

        if (policy === 'strict') {
          // FAIL FAST: Anti-Leak Protection
          // We throw Error to prevent request from going to BFF without context.
          const msg = "[API] ⛔ Protocol Violation: Missing Tenant Context (Strict Policy)";
          const method = init?.method ?? "GET";
          logger.error(msg, { url, method });
          throw new Error(msg);
        } else {
          // OPTIONAL: Allow check to proceed (e.g. system routes, auth, health)
          logger.debug("[API] ℹ️ Skipping Tenant Context (Policy: Optional)");
        }
      }

      // Debug Trace
      if (requestId || tenantSlug) {
        // logger.debug("[API] SSR Context Forwarded", { requestId, tenantSlug, explicit: !!(newInit as FetchOptions).xTenantSlug });
      }

      newInit.headers = headers;

      // Cleanup custom props from init so they don't leak to fetch (though fetch usually ignores)
      delete (newInit as FetchOptions).xTenantSlug;
      delete (newInit as FetchOptions).public;

    } catch (err) {
      // Log errors for debugging but don't crash
      logger.error("[API] Error in augmentInit:", err);

      // [Fail-Fast] Re-throw for strict policy to prevent context-less requests
      const policy = (newInit as FetchOptions).tenantPolicy || 'strict';
      if (policy === 'strict') {
        throw err;
      }
    }
  } else {
    // Client-side: ensure browser sends cookies (cross-origin supported if domains match)
    newInit.credentials = (newInit as FetchOptions).public ? "omit" : "include";
    delete (newInit as FetchOptions).public;
  }
  return newInit;
}

// Public config fetcher: no cookies/headers forwarding, only tenant context
async function fetchJsonPublic<T = unknown>(url: string, tenantSlug: string, options?: { cache?: RequestCache }): Promise<T> {
  const headers = new Headers();
  headers.set("x-tenant-slug", tenantSlug);

  const response = await fetch(url, {
    method: "GET",
    headers,
    credentials: "omit",
    cache: options?.cache ?? "no-store",
  });

  const text = await response.text().catch(err => {
    throw new FetchJsonError("Failed to read response body", { url, method: "GET", cause: err });
  });

  if (!response.ok) {
    const bodySnippet = text.slice(0, 800);
    throw new FetchJsonError("Upstream request failed", { url, method: "GET", status: response.status, bodySnippet });
  }

  try {
    return JSON.parse(text) as T;
  } catch (e) {
    throw new FetchJsonError("Invalid JSON from upstream", { url, method: "GET", cause: e });
  }
}

/** Canonical fetch for GET /config (server cache with tenant tag + short revalidate). */
export async function getTenantConfig(tenantSlug: string): Promise<StorefrontConfig> {
  const cached = unstable_cache(
    async () => {
      const json = await fetchJsonPublic<unknown>(`${BFF}/config`, tenantSlug, { cache: "no-store" });
      const parsed = zStorefrontConfig.safeParse(json);
      if (!parsed.success) {
        throw new Error("Invalid StorefrontConfig structure", { cause: parsed.error });
      }
      const amContent = (json as { amContent?: AmContentV1 })?.amContent;
      const withDefaults =
        parsed.data.mainTemplate === "berlin-press" ? (amContent ?? AM_CONTENT_DEFAULTS) : amContent;
      return { ...parsed.data, amContent: withDefaults };
    },
    ["tenant-config", tagSlug(tenantSlug)],
    { tags: [tenantTag(tenantSlug)], revalidate: 300 }
  );
  return cached();
}

export async function getDefaultBranch(tenantSlug: string) {
  const json = await fetchJsonPublic<unknown>(`${BFF}/branches/default`, tenantSlug, { cache: "no-store" });
  const parsed = zBranchListItem.safeParse(json);
  if (!parsed.success) {
    throw new Error("Invalid Default Branch Structure", { cause: parsed.error });
  }
  return parsed.data;
}

export async function listBranches(): Promise<Array<{ slug: string; cityName: string }>> {
  // System Route: Lists all branches, no specific tenant context needed (or derived from domain?)
  // Actually usually this is for "Choose City" page which might be multi-tenant or platform-level.
  // Canonical: treat as public/system route, so tenant context is optional.
  try {
    const data = await fetchJsonStrict<unknown>(`${BFF}/branches`, { cache: "no-store", tenantPolicy: 'optional' });

    // Validation: Ensure the returned value matches contract
    const parsed = zBranchList.safeParse(data);
    if (!parsed.success) {
      throw new Error("Invalid Branch List Structure", { cause: parsed.error });
    }

    return parsed.data;
  } catch (err) {
    // 404 means no branches exist - valid empty state
    if (err instanceof FetchJsonError && err.status === 404) {
      return [];
    }
    // Otherwise: rethrow (fail-fast for 500/timeout/etc)
    throw err;
  }
}

export const getBranchConfig = cache(async (branchSlug: string, tenantSlug: string) => {
  // Safety check: reject obviously invalid slugs
  if (!branchSlug || branchSlug === 'favicon.ico' || branchSlug.includes('.')) {
    return null;
  }

  const cached = unstable_cache(
    async () => {
      try {
        const json = await fetchJsonPublic<unknown>(`${BFF}/branches/${branchSlug}`, tenantSlug, { cache: "no-store" });

        const parsed = zBranchConfig.safeParse(json);
        if (!parsed.success) {
          throw new Error("Invalid BranchConfig Structure", { cause: parsed.error });
        }
        return parsed.data;
      } catch (err) {
        if (err instanceof FetchJsonError && err.status === 404) {
          return null; // Branch not found - valid empty state
        }
        throw err; // Re-throw all other errors (400, 500, network, parse, validation)
      }
    },
    ["branch-config", tagSlug(tenantSlug), tagSlug(branchSlug)],
    { tags: [tenantTag(tenantSlug)], revalidate: 3600 }
  );
  return cached();
});

export async function getMenu(branchSlug: string, tenantSlug: string, locale?: string) {
  const tags = [
    tenantTag(tenantSlug),
    menuTenantTag(tenantSlug, locale),
    menuTag(tenantSlug, branchSlug, locale)
  ];
  const headers = locale ? { "x-am-locale": locale } : undefined;

  // Tenant+branch scoped cache with explicit tags for invalidation.
  const json = await fetchJsonStrict<unknown>(`${BFF}/menu?branchSlug=${branchSlug}`, {
    xTenantSlug: tenantSlug,
    tenantPolicy: "strict",
    public: true,
    next: { revalidate: 120, tags },
    headers
  });

  const parsed = zMenuResponse.safeParse(json);
  if (!parsed.success) {
    console.error("ZOD ERROR DETAILS:", JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid Menu Structure", { cause: parsed.error });
  }
  return parsed.data;
}

export async function getMenuItems(branchSlug: string, tenantSlug: string, locale?: string) {
  const tags = [
    tenantTag(tenantSlug),
    menuTenantTag(tenantSlug, locale),
    menuTag(tenantSlug, branchSlug, locale)
  ];
  const headers = locale ? { "x-am-locale": locale } : undefined;

  const json = await fetchJsonStrict<unknown>(`${BFF}/menu/items?branchSlug=${branchSlug}`, {
    xTenantSlug: tenantSlug,
    tenantPolicy: "strict",
    public: true,
    next: { revalidate: 120, tags },
    headers
  });

  const parsed = zMenuItemsPayload.safeParse(json);
  if (!parsed.success) {
    console.error("ZOD ERROR DETAILS:", JSON.stringify(parsed.error.format(), null, 2));
    throw new Error("Invalid MenuItems Structure", { cause: parsed.error });
  }
  return parsed.data;
}

export async function getMenuCategory(branchSlug: string, categorySlug: string, tenantSlug: string, locale?: string) {
  try {
    const tags = [
      tenantTag(tenantSlug),
      menuTenantTag(tenantSlug, locale),
      menuTag(tenantSlug, branchSlug, locale)
    ];
    const headers = locale ? { "x-am-locale": locale } : undefined;
    const json = await fetchJsonStrict<unknown>(`${BFF}/menu/category/${categorySlug}?branchSlug=${branchSlug}`, {
      xTenantSlug: tenantSlug,
      tenantPolicy: "strict",
      public: true,
      next: { revalidate: 120, tags },
      headers
    });

    const parsed = zMenuCategoryPayload.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid MenuCategoryPayload for ${branchSlug}/${categorySlug}`, { cause: parsed.error });
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof FetchJsonError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getMenuCategorySummary(branchSlug: string, categorySlug: string, tenantSlug: string, locale?: string) {
  try {
    const tags = [
      tenantTag(tenantSlug),
      menuTenantTag(tenantSlug, locale),
      menuTag(tenantSlug, branchSlug, locale)
    ];
    const headers = locale ? { "x-am-locale": locale } : undefined;
    const json = await fetchJsonStrict<unknown>(`${BFF}/menu/category/${categorySlug}/summary?branchSlug=${branchSlug}`, {
      xTenantSlug: tenantSlug,
      tenantPolicy: "strict",
      public: true,
      next: { revalidate: 120, tags },
      headers
    });

    const parsed = zMenuCategorySummaryPayload.safeParse(json);
    if (!parsed.success) {
      throw new Error(`Invalid MenuCategorySummaryPayload for ${branchSlug}/${categorySlug}`, { cause: parsed.error });
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof FetchJsonError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getMenuItem(branchSlug: string, id: string, tenantSlug: string, locale?: string) {
  try {
    const tags = [
      tenantTag(tenantSlug),
      menuTenantTag(tenantSlug, locale),
      menuTag(tenantSlug, branchSlug, locale)
    ];
    const headers = locale ? { "x-am-locale": locale } : undefined;
    const json = await fetchJsonStrict<unknown>(`${BFF}/menu/item/${id}?branchSlug=${branchSlug}`, {
      xTenantSlug: tenantSlug,
      tenantPolicy: "strict",
      public: true,
      next: { revalidate: 120, tags },
      headers
    });

    const parsed = zMenuItem.safeParse(json);
    if (!parsed.success) {
      throw new Error("Invalid MenuItem Structure", { cause: parsed.error });
    }

    return parsed.data;
  } catch (error) {
    if (error instanceof FetchJsonError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getDelivery(branchSlug: string, tenantSlug: string) {
  try {
    const raw = await fetchJsonStrict<unknown>(`${BFF}/delivery/${branchSlug}`, { cache: "no-store", xTenantSlug: tenantSlug, tenantPolicy: "strict" });
    const parsed = zDeliveryResponse.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Invalid DeliveryResponse Structure", { cause: parsed.error });
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof FetchJsonError) {
      // 1. Client/Contract Errors (4xx except 404) -> Rethrow (never mask)
      if (err.status && err.status >= 400 && err.status < 500 && err.status !== 404) {
        throw err;
      }

      // 2. Service Availability (404, 5xx, Network/Timeout) -> Fallback
      // 404: Branch not found (or delivery not configured)
      // 5xx: Upstream error
      // undefined status: Timeout or Network Error
      return { mode: "fallback" as const, message: "Delivery service is temporarily unavailable." };
    }

    // 3. Unknown errors -> Rethrow
    throw err;
  }
}

const FALLBACK_TIME_SLOTS: TimeSlotsResponse = {
  slots: [],
  timezone: "UTC",
  isScheduledOrderingEnabled: false,
};

export async function getTimeSlots(branchSlug: string, tenantSlug: string): Promise<TimeSlotsResponse> {
  try {
    const json = await fetchJsonStrict<unknown>(`${BFF}/time-slots?branchSlug=${branchSlug}`, { cache: "no-store", xTenantSlug: tenantSlug, tenantPolicy: 'strict' });

    const parsed = zTimeSlotsResponse.safeParse(json);
    if (!parsed.success) {
      throw new Error("Invalid TimeSlotsResponse Structure", { cause: parsed.error });
    }
    return parsed.data;
  } catch (error) {
    if (error instanceof FetchJsonError && error.status === 404) {
      // 404: Branch not found / Service not configured -> Fallback
      return FALLBACK_TIME_SLOTS;
    }

    // All other errors (5xx, Network/Timeout, etc) -> Rethrow to allow UI to show outage warning
    throw error;
  }
}

export async function getAdminOrders(branchSlug: string, tenantSlug: string) {
  try {
    const raw = await fetchJsonStrict<unknown>(`${BFF}/admin/${branchSlug}/orders`, {
      cache: "no-store",
      xTenantSlug: tenantSlug,
      tenantPolicy: "strict"
    });

    const parsed = zOrderListResponse.safeParse(raw);
    if (parsed.success) {
      return parsed.data;
    } else {
      throw new Error("Invalid Admin Orders Structure", { cause: parsed.error });
    }
  } catch (err) {
    if (err instanceof FetchJsonError && err.status === 404) {
      // 404 means no orders - valid empty state
      return [];
    } else {
      throw err;
    }
  }
}

const DASHBOARD_STATS_FALLBACK: DashboardStats = {
  meta: {
    isDegraded: true,
    skippedOrders: 0
  },
  revenue: 0,
  deliveryRevenue: 0,
  avgCheck: 0,
  orders: {
    done: 0,
    cancelled: 0,
    inProgress: 0,
  },
  topProducts: [],
};

export async function getDashboardStats(branchSlug: string, tenantSlug: string): Promise<DashboardStats> {
  try {
    const raw = await fetchJsonStrict<unknown>(`${BFF}/admin/${branchSlug}/stats`, {
      cache: "no-store",
      xTenantSlug: tenantSlug,
      tenantPolicy: "strict"
    });
    const parsed = zDashboardStats.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Invalid DashboardStats Structure", { cause: parsed.error });
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof FetchJsonError) {
      // Allow fallback only for transient upstream failures
      const status = err.status;
      if (status === 502 || status === 503 || status === 504) {
        return DASHBOARD_STATS_FALLBACK;
      }
      // Allow fallback for timeout/network errors (no status or status undefined)
      if (!status) {
        return DASHBOARD_STATS_FALLBACK;
      }
      // For all other status codes (400, 401, 403, 404, 500, etc.) - throw
      throw err;
    }
    // For any non-FetchJsonError - throw
    throw err;
  }
}


export async function getAdminMenu(branchSlug: string, tenantSlug: string) {
  const json = await fetchJsonStrict<unknown>(`${BFF}/admin/${branchSlug}/menu`, { cache: "no-store", xTenantSlug: tenantSlug, tenantPolicy: "strict" });

  // We can reuse zMenuResponse because the shape is compatible (categories + items)
  // even if internally we might have extra fields like isAvailable on categories now (zod allows extra fields by default in some configs, 
  // but if strictly typed, we might need a looser schema or just cast if we trust BFF).
  // zMenuResponse expects categories without isAvailable? Let's check Contracts.
  // We updated zMenuCategory to have isAvailable. So it should pass.

  const parsed = zMenuResponse.safeParse(json);
  if (!parsed.success) {
    logger.error("ZOD ERROR (Admin Menu):", JSON.stringify(parsed.error.format(), null, 2));
    logger.error("RAW JSON TRUNCATED:", JSON.stringify(json).slice(0, 500));
    // Return empty fallback instead of crashing
    // But ideally we want to see the error. The UI Error Boundary handles exceptions.
    // Let's THROW so the standard UI Error boundary catches it and shows the message.
    throw new Error(`Invalid Admin Menu Structure: ${parsed.error.issues.map(i => i.path.join('.') + ': ' + i.message).join(', ')}`);
  }
  return parsed.data;
}



/** ACCESS_LEVELS Phase 6.1: Current user admin context for menu (role, permissions, enabled module IDs). Phase 6.3: isSuperAdmin. Phase 3.5: allowedBranchIds (null = all branches). */
export type AdminMeResponse = {
    role: "TENANT_OWNER" | "TENANT_ADMIN";
    permissions: Record<string, { canView: boolean; canEdit: boolean; allowedBranchIds: string[] | null }> | null;
    /** Canonical list from BFF (contracts); type so consumers get AdminModuleId without cast. */
    enabledAdminModuleIds: AdminModuleId[];
    isSuperAdmin?: boolean;
};

export async function getAdminMe(tenantSlug: string): Promise<AdminMeResponse | null> {
    try {
        const raw = await fetchJsonStrict<unknown>(`${BFF}/admin/me`, {
            cache: "no-store",
            xTenantSlug: tenantSlug,
            tenantPolicy: "strict",
        });
        if (typeof raw !== "object" || raw === null || !("role" in raw) || !("enabledAdminModuleIds" in raw)) {
            return null;
        }
        const data = raw as AdminMeResponse;
        if (!Array.isArray(data.enabledAdminModuleIds)) return null;
        return data;
    } catch {
        return null;
    }
}

/** ACCESS_LEVELS Phase 5: GET /admin/branches — list branches for tenant (owner only). Used for scope/branch selector in users UI. */
export type AdminBranchItem = { id: string; slug: string; cityName: string };
export type AdminBranchesResponse = { branches: AdminBranchItem[] };

export async function getAdminBranches(tenantSlug: string): Promise<AdminBranchesResponse> {
    const raw = await fetchJsonStrict<unknown>(`${BFF}/admin/branches`, {
        cache: "no-store",
        xTenantSlug: tenantSlug,
        tenantPolicy: "strict",
    });
    if (typeof raw !== "object" || raw === null || !("branches" in raw) || !Array.isArray((raw as AdminBranchesResponse).branches)) {
        throw new Error("Invalid Admin Branches response");
    }
    const data = raw as AdminBranchesResponse;
    return data;
}

/** ACCESS_LEVELS Phase 5: Tenant members (owner only). Phase 3.5: branchIds always string[] (ALL → []). */
export type AdminMemberPermission = {
    canView: boolean;
    canEdit: boolean;
    scopeType: "ALL" | "BRANCH";
    branchIds: string[];
};
export type AdminMember = {
    userId: string;
    email: string;
    role: "TENANT_OWNER" | "TENANT_ADMIN";
    permissions: Record<string, AdminMemberPermission> | null;
};

export type AdminUsersResponse = {
    members: AdminMember[];
    /** Canonical list from BFF (contracts); type so consumers get AdminModuleId without cast. */
    enabledAdminModuleIds: AdminModuleId[];
};

export async function getAdminUsers(tenantSlug: string): Promise<AdminUsersResponse> {
    const raw = await fetchJsonStrict<unknown>(`${BFF}/admin/users`, {
        cache: "no-store",
        xTenantSlug: tenantSlug,
        tenantPolicy: "strict",
    });
    if (typeof raw !== "object" || raw === null || !("members" in raw) || !Array.isArray((raw as AdminUsersResponse).members)) {
        throw new Error("Invalid Admin Users response");
    }
    const data = raw as AdminUsersResponse;
    if (!Array.isArray(data.enabledAdminModuleIds)) {
        throw new Error("Invalid Admin Users response: missing enabledAdminModuleIds");
    }
    return data;
}

export async function getBranchSettings(branchSlug: string, tenantSlug: string): Promise<BranchSettings | null> {
  try {
    const raw = await fetchJsonStrict<unknown>(`${BFF}/admin/${branchSlug}/settings`, {
      cache: "no-store",
      xTenantSlug: tenantSlug,
      tenantPolicy: "strict"
    });

    const parsed = zBranchSettings.safeParse(raw);
    if (!parsed.success) {
      throw new Error("Invalid BranchSettings Structure", { cause: parsed.error });
    }
    return parsed.data;
  } catch (err) {
    if (err instanceof FetchJsonError && err.status === 404) {
      // 404 means settings not found / not configured - valid empty state
      return null;
    }
    // For all other errors (network, 500, parse failures, etc.) - rethrow
    throw err;
  }
}

// ============================================
// Journal (public)
// ============================================

export type JournalListItem = {
    id: string;
    slug: string;
    publishedAt: string | null;
    coverImageKey: string | null;
    locale: string | null;
    title: string | null;
    excerpt: string | null;
};

export type JournalListResponse = {
    items: JournalListItem[];
    nextCursor: string | null;
};

export type JournalHomeItem = JournalListItem & {
    homeSlot: number | null;
};

export async function getJournalHome(
    tenantSlug: string,
    args?: { locale?: string }
): Promise<{ items: JournalHomeItem[] }> {
    const qs = new URLSearchParams();
    if (args?.locale) qs.set("locale", args.locale);
    const url = `${BFF}/journal/home${qs.toString() ? `?${qs.toString()}` : ""}`;
    const raw = await fetchJsonStrict<unknown>(url, {
        cache: "no-store",
        xTenantSlug: tenantSlug,
        tenantPolicy: "strict",
        public: true,
    });
    if (typeof raw !== "object" || raw === null) throw new Error("Invalid journal home response");
    const rec = raw as { items?: unknown };
    if (!Array.isArray(rec.items)) throw new Error("Invalid journal home response: items");
    const items: JournalHomeItem[] = rec.items.map((it) => {
        const o = it as Partial<Record<string, unknown>>;
        if (typeof o.id !== "string" || typeof o.slug !== "string") throw new Error("Invalid journal home item");
        return {
            id: o.id,
            slug: o.slug,
            homeSlot: typeof o.homeSlot === "number" ? o.homeSlot : null,
            publishedAt: typeof o.publishedAt === "string" ? o.publishedAt : null,
            coverImageKey: typeof o.coverImageKey === "string" ? o.coverImageKey : null,
            locale: typeof o.locale === "string" ? o.locale : null,
            title: typeof o.title === "string" ? o.title : null,
            excerpt: typeof o.excerpt === "string" ? o.excerpt : null,
        };
    });
    return { items };
}

export async function getJournalList(
    tenantSlug: string,
    args?: { cursor?: string; limit?: number; locale?: string }
): Promise<JournalListResponse> {
    const qs = new URLSearchParams();
    if (args?.cursor) qs.set("cursor", args.cursor);
    if (args?.limit) qs.set("limit", String(args.limit));
    if (args?.locale) qs.set("locale", args.locale);
    const url = `${BFF}/journal${qs.toString() ? `?${qs.toString()}` : ""}`;
    const raw = await fetchJsonStrict<unknown>(url, {
        cache: "no-store",
        xTenantSlug: tenantSlug,
        tenantPolicy: "strict",
        public: true,
    });
    if (typeof raw !== "object" || raw === null) throw new Error("Invalid journal list response");
    const rec = raw as { items?: unknown; nextCursor?: unknown };
    if (!Array.isArray(rec.items)) throw new Error("Invalid journal list response: items");
    const items: JournalListItem[] = rec.items.map((it) => {
        const o = it as Partial<Record<string, unknown>>;
        if (typeof o.id !== "string" || typeof o.slug !== "string") throw new Error("Invalid journal list item");
        return {
            id: o.id,
            slug: o.slug,
            publishedAt: typeof o.publishedAt === "string" ? o.publishedAt : null,
            coverImageKey: typeof o.coverImageKey === "string" ? o.coverImageKey : null,
            locale: typeof o.locale === "string" ? o.locale : null,
            title: typeof o.title === "string" ? o.title : null,
            excerpt: typeof o.excerpt === "string" ? o.excerpt : null,
        };
    });
    const nextCursor = typeof rec.nextCursor === "string" ? rec.nextCursor : null;
    return { items, nextCursor };
}

export type JournalPostResponse = {
    id: string;
    slug: string;
    publishedAt: string | null;
    coverImageKey: string | null;
    locale: string;
    title: string;
    excerpt: string | null;
    markdown: string;
};

export async function getJournalPostBySlug(
    tenantSlug: string,
    slug: string,
    args?: { locale?: string }
): Promise<JournalPostResponse | null> {
    const qs = new URLSearchParams();
    if (args?.locale) qs.set("locale", args.locale);
    const url = `${BFF}/journal/${encodeURIComponent(slug)}${qs.toString() ? `?${qs.toString()}` : ""}`;
    try {
        const raw = await fetchJsonStrict<unknown>(url, {
            cache: "no-store",
            xTenantSlug: tenantSlug,
            tenantPolicy: "strict",
            public: true,
        });
        if (typeof raw !== "object" || raw === null) throw new Error("Invalid journal post response");
        const o = raw as Partial<Record<string, unknown>>;
        if (typeof o.id !== "string" || typeof o.slug !== "string") throw new Error("Invalid journal post response");
        if (typeof o.locale !== "string" || typeof o.title !== "string" || typeof o.markdown !== "string") {
            throw new Error("Invalid journal post response fields");
        }
        return {
            id: o.id,
            slug: o.slug,
            publishedAt: typeof o.publishedAt === "string" ? o.publishedAt : null,
            coverImageKey: typeof o.coverImageKey === "string" ? o.coverImageKey : null,
            locale: o.locale,
            title: o.title,
            excerpt: typeof o.excerpt === "string" ? o.excerpt : null,
            markdown: o.markdown,
        };
    } catch (err) {
        if (err instanceof FetchJsonError && err.status === 404) return null;
        throw err;
    }
}
