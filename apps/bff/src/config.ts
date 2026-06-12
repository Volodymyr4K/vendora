import { z } from "zod";

/**
 * Helper to strict-parse JSON environment variables
 * @param schema Zod schema to validate the parsed JSON against
 * @param defaultValue Value to return if env var is empty/undefined
 */
const zodJson = <T extends z.ZodTypeAny>(schema: T, defaultValue: z.infer<T>) =>
  z.string().optional().transform((str, ctx): z.infer<T> => {
    if (!str || str === "undefined") return defaultValue;
    try {
      const parsed = JSON.parse(str);
      return schema.parse(parsed);
    } catch (e) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Invalid JSON config: ${e instanceof Error ? e.message : String(e)}`
      });
      // In Fail-Fast mode, we want to throw or return NEVER. 
      // However, to satisfy TS return type, we return the defaultValue here 
      // because addIssue will prevent successful parsing anyway.
      return defaultValue;
    }
  });

const zEnv = z.object({
  PORT: z.coerce.number().int().positive().default(4000),

  LOG_LEVEL: z.string().default("info"),

  // Upstream
  UPSTREAM_MODE: z.enum(["mock", "http", "database"]).default("mock"),
  UPSTREAM_BASE_URL: z.string().url().optional(),

  // JSON Configs with Fail-Fast Validation
  // We use z.any() as a fallback for the record value to avoid "unknown" inference issues,
  // then we validate it IS a string map.
  UPSTREAM_HEADERS_JSON: zodJson(z.record(z.string(), z.string()), {}),
  UPSTREAM_ENDPOINTS_JSON: zodJson(z.record(z.string(), z.string()), {}),

  // Upstream normalization / adapters
  UPSTREAM_ADAPTER: z.enum(["auto", "passthrough", "generic"]).default("auto"),
  UPSTREAM_UNWRAP_KEYS: z.string().default("data,result,payload,menu,response"),
  UPSTREAM_RECORD_ENABLED: z.coerce.boolean().default(false),
  UPSTREAM_RECORD_DIR: z.string().default(".cache/upstream_raw"),
  UPSTREAM_RECORD_MAX_BYTES: z.coerce.number().int().positive().default(150000),

  DEBUG_ROUTES_ENABLED: z.coerce.boolean().default(false),

  // Upstream discovery (dev helper)
  UPSTREAM_DISCOVERY_ENABLED: z.coerce.boolean().default(false),
  UPSTREAM_DISCOVERY_BRANCH_SLUG: z.string().default("armashivka"),
  UPSTREAM_DISCOVERY_WRITE_FILE: z.coerce.boolean().default(true),
  UPSTREAM_DISCOVERY_SAVE_PATH: z.string().default(".cache/upstream_endpoints.json"),
  UPSTREAM_DISCOVERY_TIMEOUT_MS: z.coerce.number().int().positive().default(3500),
  UPSTREAM_DISCOVERY_CANDIDATES_JSON: zodJson(z.record(z.string(), z.array(z.string())), {}),

  // Cache
  CACHE_MODE: z.enum(["memory", "redis"]).default("memory"),
  CACHE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  CACHE_STALE_SECONDS: z.coerce.number().int().positive().default(600),
  REDIS_URL: z.string().optional(),

  // Resilience
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(4500),
  RETRY_COUNT: z.coerce.number().int().nonnegative().default(1),
  RETRY_BACKOFF_MS: z.coerce.number().int().positive().default(250),

  // Rate limit
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(1000),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().int().positive().default(60_000),
  // Sensitive endpoints limits (per minute)
  RATE_LIMIT_ORDER: z.coerce.number().int().positive().default(10), // Limit order spam (3 is too strict for offices)
  RATE_LIMIT_QUOTE: z.coerce.number().int().positive().default(20), // Limit scraper bots


  // Checkout
  IDEMPOTENCY_TTL_SECONDS: z.coerce.number().int().positive().default(86_400),
  ORDER_TTL_SECONDS: z.coerce.number().int().positive().default(604_800),
  ORDER_UPSTREAM_ENABLED: z.coerce.boolean().default(false),

  // Observability
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_ROUTE: z.string().default("/metrics"),
  SENTRY_DSN: z.string().optional(),

  // Auth
  ADMIN_USERNAME: z.string().min(1).default("admin"), // Fallback for dev, usually overriden
  ADMIN_PASSWORD: z.string().min(1).default("admin123"),
  JWT_SECRET: z.string().min(8).default("super-secret-jwt-key-change-me"),
  COOKIE_SECRET: z.string().min(8).default("super-secret-cookie-key-change-me"),

  // Circuit breaker (upstream)
  BREAKER_ENABLED: z.coerce.boolean().default(true),
  BREAKER_FAILURE_THRESHOLD: z.coerce.number().int().positive().default(5),
  BREAKER_OPEN_MS: z.coerce.number().int().positive().default(20_000),
  BREAKER_HALFOPEN_MAX: z.coerce.number().int().positive().default(2),

  // Cache behavior
  CACHE_SWR_ENABLED: z.coerce.boolean().default(true),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  INTERNAL_API_SECRET: z.string().min(32, "INTERNAL_API_SECRET must be at least 32 characters for security"),

  // Payments (V2 Payment Core)
  // Must be explicitly configured; do not infer from NODE_ENV.
  PAYMENTS_MODE: z.enum(["TEST", "LIVE"]).default("TEST"),
});

export type AppConfig = z.infer<typeof zEnv>;

export function loadConfig(
  env: NodeJS.ProcessEnv
): AppConfig & {
  upstreamEndpoints: UpstreamEndpoints;
  upstreamHeaders: Record<string, string>;
  upstreamEndpointsProvided: boolean;
  upstreamUnwrapKeys: string[];
} {
  // This will THROW if validation fails (Fail-Fast)
  const cfg = zEnv.parse(env);

  // Defaults for upstream endpoints
  const defaults: UpstreamEndpoints = {
    branches: "/branches",
    branch: "/branches/{branch}",
    menu: "/menu",
    delivery: "/delivery/{branch}",
    quote: "/cart/quote",
    orderCreate: "/orders",
    orderStatus: "/orders/{orderId}",
  };

  // Merge defaults with parsed JSON
  const upstreamEndpoints: UpstreamEndpoints = {
    ...defaults,
    ...cfg.UPSTREAM_ENDPOINTS_JSON
  } as UpstreamEndpoints;

  const upstreamHeaders = cfg.UPSTREAM_HEADERS_JSON;

  const upstreamEndpointsProvided = Boolean(env.UPSTREAM_ENDPOINTS_JSON);

  const upstreamUnwrapKeys = cfg.UPSTREAM_UNWRAP_KEYS
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  return { ...cfg, upstreamEndpoints, upstreamHeaders, upstreamEndpointsProvided, upstreamUnwrapKeys };
}


export type UpstreamEndpoints = {
  branches: string;
  branch: string;   // supports {branch}
  menu: string;
  delivery: string; // supports {branch}
  quote?: string;        // optional
  orderCreate?: string;  // optional
  orderStatus?: string;  // supports {orderId} (optional)
};
