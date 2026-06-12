// zQuoteRequest, zOrderCreateRequest unused
import {
  zMenuResponse,
  zDeliveryResponse,
  zQuoteResponse,
  zOrderCreateResponse,
  type MenuResponse,
  type DeliveryResponse,
  type QuoteRequest,
  type QuoteResponse,
  type OrderCreateRequest,
  type OrderCreateResponse,
  zUpstreamOrderStatusResponse,
  type UpstreamOrderStatusResponse,
  zBranchConfigWithoutTenant,
  type BranchConfigWithoutTenant
} from "@vendora/contracts";
import type { AppConfig, UpstreamEndpoints } from "../config.js";
// handleValidationError unused
import { fetchJson } from "./http.js";
import { branches as mockBranches, menu as mockMenu, deliveryByBranch as mockDeliveryByBranch } from "../mock/data.js";
import { CircuitBreaker } from "./breaker.js";
import { createRecorder } from "./record.js";
import { normalizeBranches, normalizeMenu, normalizeDelivery } from "./normalize/index.js";
import type { Metrics } from "../observability/metrics.js";

import { PrismaUpstream } from "./upstream/prisma.js";

export type UpstreamContext = { requestId?: string; tenantId: string; tenantSlug: string };

/**
 * Upstream service interface for all external API communication
 * 
 * Type-safe interface with strict contracts from @vendora/contracts
 * All methods must validate responses at runtime using Zod schemas
 */
export type Upstream = {
  getBranches(ctx: UpstreamContext): Promise<Array<{ slug: string; cityName: string }>>;

  /** Get single branch configuration (without tenant - added in routes from req.tenant) */
  getBranch(branch: string, ctx: UpstreamContext): Promise<BranchConfigWithoutTenant>;

  /** Get menu (categories + items) */
  getMenu(ctx: UpstreamContext): Promise<MenuResponse>;

  /** Get delivery configuration for branch */
  getDelivery(branch: string, ctx: UpstreamContext): Promise<DeliveryResponse>;

  /** Optional — used when ORDER_UPSTREAM_ENABLED=true */
  createOrder?: (payload: OrderCreateRequest, ctx: UpstreamContext) => Promise<OrderCreateResponse>;

  /** Get order status from upstream */
  getOrderStatus?: (orderId: string, ctx: UpstreamContext) => Promise<UpstreamOrderStatusResponse>;

  /** Optional — not required (BFF can compute quote locally) */
  quote?: (payload: QuoteRequest, ctx: UpstreamContext) => Promise<QuoteResponse>;
};

function fill(tpl: string, params: Record<string, string>) {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => params[k] ?? "");
}

type Cfg = AppConfig & {
  upstreamEndpoints: UpstreamEndpoints;
  upstreamHeaders: Record<string, string>;
  upstreamUnwrapKeys: string[];
};

/**
 * Create an Upstream client for external API communication
 * 
 * Supports three modes:
 * - **database**: Direct Prisma queries (no external API)
 * - **mock**: In-memory mock data (for development)
 * - **http**: External HTTP API with circuit breaker
 * 
 * Features:
 * - Circuit Breaker pattern (prevents cascade failures)
 * - Automatic retry with exponential backoff
 * - Request/response recording (debug mode)
 * - Prometheus metrics for latency tracking
 * 
 * @param cfg - Application configuration
 * @param metrics - Optional Prometheus metrics collector
 * 
 * @example
 * ```typescript
 * const upstream = createUpstream(config, metrics);
 * const branches = await upstream.getBranches({ requestId: '123', tenantId: 'tenant-1' });
 * ```
 */
export function createUpstream(cfg: Cfg, metrics?: Metrics): Upstream {
  const recorder = createRecorder({ enabled: cfg.UPSTREAM_RECORD_ENABLED, dir: cfg.UPSTREAM_RECORD_DIR, maxBytes: cfg.UPSTREAM_RECORD_MAX_BYTES });

  const breaker = new CircuitBreaker({
    name: "upstream",
    enabled: cfg.BREAKER_ENABLED,
    failureThreshold: cfg.BREAKER_FAILURE_THRESHOLD,
    openMs: cfg.BREAKER_OPEN_MS,
    halfOpenMax: cfg.BREAKER_HALFOPEN_MAX,
  });

  function setBreakerGauge() {
    if (!metrics) return;
    // encode: 0 closed, 1 open, 2 half_open
    const s = breaker.getState();
    const v = s === "open" ? 1 : s === "half_open" ? 2 : 0;
    metrics.breakerState.set({ name: "upstream" }, v);
  }

  async function callHttp(op: string, url: string, ctx: UpstreamContext, init?: RequestInit) {
    if (!ctx?.tenantSlug || ctx.tenantSlug.trim() === "") {
      throw new Error("Missing tenantSlug for HTTP upstream");
    }
    setBreakerGauge();
    const t0 = Date.now();
    const result = await breaker.exec(async () => {
      return fetchJson(url, {
        timeoutMs: cfg.REQUEST_TIMEOUT_MS,
        retries: cfg.RETRY_COUNT,
        backoffMs: cfg.RETRY_BACKOFF_MS,
        headers: { ...(cfg.upstreamHeaders ?? {}), "x-tenant-slug": ctx.tenantSlug },
        requestId: ctx?.requestId,
        op,
      }, init);
    });
    const dt = (Date.now() - t0) / 1000;
    metrics?.upstreamDuration.observe({ op, status: "ok" }, dt);
    recorder.record(op, 200, url, result);
    return result;
  }

  async function callHttpSafe(op: string, url: string, ctx: UpstreamContext, init?: RequestInit) {
    const t0 = Date.now();
    try {
      const res = await callHttp(op, url, ctx, init);
      return res;
    } catch (e) {
      const dt = (Date.now() - t0) / 1000;
      metrics?.upstreamDuration.observe({ op, status: "error" }, dt);
      throw e;
    }
  }

  if (cfg.UPSTREAM_MODE === "database") {
    return new PrismaUpstream();
  }

  if (cfg.UPSTREAM_MODE === "mock") {
    return {
      async getBranches(_ctx: UpstreamContext) {
        return mockBranches.map((b) => ({ slug: b.slug, cityName: b.cityName }));
      },
      async getBranch(branch: string, _ctx: UpstreamContext) {
        const found = mockBranches.find((b) => b.slug === branch);
        if (!found) throw new Error("Branch not found");

        // Strip tenant field as it's not part of the upstream contract
        const { tenant: _tenant, ...withoutTenant } = found;
        return withoutTenant;
      },
      async getMenu(_ctx: UpstreamContext) {
        const parsed = zMenuResponse.safeParse(mockMenu);
        if (!parsed.success) throw new Error("Invalid menu mock");
        return parsed.data;
      },
      async getDelivery(branch: string, _ctx: UpstreamContext) {
        const raw = mockDeliveryByBranch[branch];
        const parsed = zDeliveryResponse.safeParse(raw);
        if (!parsed.success) {
          return { mode: "fallback", message: "Уточніть умови доставки у чаті або телефоном." };
        }
        return parsed.data;
      },
      async quote(payload: QuoteRequest, _ctx: UpstreamContext): Promise<QuoteResponse> {
        // Mock BFF computes quote locally - return fallback mode
        return {
          mode: "fallback" as const,
          message: "Mock mode: BFF computes quote locally",
          currency: "UAH",
          branchSlug: payload.branchSlug,
          lines: [],
          subtotal: 0,
          deliveryFee: 0,
          total: 0,
        };
      },
      async createOrder(_payload: OrderCreateRequest, _ctx: UpstreamContext): Promise<OrderCreateResponse> {
        // Emulate upstream order creation
        const timestamp = Date.now();
        return {
          token: `mock-token-${timestamp}`,
          orderId: `MOCK-${timestamp}`,
          status: "created" as const,
          createdAt: new Date().toISOString(),
        };
      },
      async getOrderStatus(orderId: string, _ctx: UpstreamContext) {
        return { orderId, status: "confirmed" };
      },
    };
  }

  if (!cfg.UPSTREAM_BASE_URL) throw new Error("UPSTREAM_BASE_URL is required for UPSTREAM_MODE=http");

  const base = cfg.UPSTREAM_BASE_URL.replace(/\/$/, "");
  const ep = cfg.upstreamEndpoints;

  return {

    async getBranches(ctx: UpstreamContext) {
      const raw = await callHttpSafe("branches", base + ep.branches, ctx);
      return normalizeBranches(raw, { unwrapKeys: cfg.upstreamUnwrapKeys });
    },

    async getBranch(branch: string, ctx: UpstreamContext) {
      const url = base + fill(ep.branch, { branch });
      const raw = await callHttpSafe("branch", url, ctx);
      // Dynamic unwrapping - use unknown for safety
      const rawU: unknown = (raw && typeof raw === "object") ? (cfg.upstreamUnwrapKeys.reduce((acc: unknown, k: string) => (acc && typeof acc === 'object' && k in acc ? (acc as Record<string, unknown>)[k] : acc), raw) ?? raw) : raw;

      // Cast to record for property access
      const data = rawU as Record<string, unknown>;

      const adapted = {
        slug: data?.slug ?? data?.branchSlug ?? data?.id ?? branch,
        cityName: data?.cityName ?? data?.city ?? data?.name ?? data?.title,
        address: data?.address,
        phones: data?.phones ?? (data?.phone ? [data.phone] : []),
        workingSchedule: data?.workingSchedule,
      };
      const parsed = zBranchConfigWithoutTenant.safeParse(adapted);
      if (!parsed.success) throw new Error("Invalid branch from upstream");
      return parsed.data;
    },


    async getMenu(ctx: UpstreamContext) {
      const raw = await callHttpSafe("menu", base + ep.menu, ctx);
      if (cfg.UPSTREAM_ADAPTER === "passthrough") {
        const parsed = zMenuResponse.safeParse(raw);
        if (!parsed.success) throw new Error("Invalid menu from upstream (passthrough)");
        return parsed.data;
      }
      return normalizeMenu(raw, {
        baseUrl: cfg.UPSTREAM_BASE_URL,
        unwrapKeys: cfg.upstreamUnwrapKeys,
        context: { requestId: ctx?.requestId }
      });
    },


    async getDelivery(branch: string, ctx: UpstreamContext) {
      const url = base + fill(ep.delivery, { branch });
      const raw = await callHttpSafe("delivery", url, ctx);
      const data = raw as Record<string, unknown>;
      if (cfg.UPSTREAM_ADAPTER === "passthrough") {
        const parsed = zDeliveryResponse.safeParse(raw);
        if (parsed.success) return parsed.data;
        const alt = data?.delivery ?? data?.config ?? data?.data ?? raw;
        const parsed2 = zDeliveryResponse.safeParse(alt);
        if (parsed2.success) return parsed2.data;
        return { mode: "fallback", message: "Уточніть умови доставки у чаті або телефоном." };
      }
      return normalizeDelivery(raw, { unwrapKeys: cfg.upstreamUnwrapKeys });
    },

    quote: ep.quote
      ? async (payload: QuoteRequest, ctx: UpstreamContext): Promise<QuoteResponse> => {
        const url = base + ep.quote!;
        const raw = await callHttpSafe("quote", url, ctx, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Runtime validation of response
        try {
          return zQuoteResponse.parse(raw);
        } catch (error) {
          // Log validation error (no logger instance available in createUpstream scope)
          console.error('[upstream/quote] Validation failed:', {
            service: 'upstream',
            method: 'quote',
            rawData: raw,
          });
          throw error; // Re-throw for upstream error handling
        }
      }
      : undefined,

    createOrder: ep.orderCreate
      ? async (payload: OrderCreateRequest, ctx: UpstreamContext): Promise<OrderCreateResponse> => {
        const url = base + ep.orderCreate!;
        const raw = await callHttpSafe("orderCreate", url, ctx, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });

        // Runtime validation of response
        try {
          return zOrderCreateResponse.parse(raw);
        } catch (error) {
          // Log validation error (no logger instance available in createUpstream scope)
          console.error('[upstream/createOrder] Validation failed:', {
            service: 'upstream',
            method: 'createOrder',
            rawData: raw,
          });
          throw error; // Re-throw for upstream error handling
        }
      }
      : undefined,

    getOrderStatus: ep.orderStatus
      ? async (orderId: string, ctx: UpstreamContext) => {
        const url = base + fill(ep.orderStatus!, { orderId });
        const raw = await callHttpSafe("orderStatus", url, ctx);
        // Runtime validation
        return zUpstreamOrderStatusResponse.parse(raw);
      }
      : undefined

  };
}
