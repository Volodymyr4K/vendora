import "./instrumentation.js";
import "dotenv/config";
import Fastify, { FastifyRequest } from "fastify";
import cors from "@fastify/cors";
import helmet from "@fastify/helmet";
import compress from "@fastify/compress";
import rateLimit from "@fastify/rate-limit";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { jsonSchemaTransform, serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import type Redis from "ioredis";

import { loadConfig } from "./config.js";

import { createCache } from "./cache/index.js";
import { createUpstream } from "./services/upstream.js";
import { createPaymentService } from "./services/payment.js";
import { prisma } from "@vendora/database";
import { discoverUpstreamEndpoints, writeDiscoveryFile } from "./services/discovery.js";
import { routesBranches } from "./domains/storefront/places/branches.routes.js";
import { routesMenu } from "./domains/storefront/catalog/menu.routes.js";
import { routesDelivery } from "./domains/storefront/fulfillment/delivery.routes.js";
import { routesCheckout } from "./domains/storefront/ordering/checkout.routes.js";
import { routesTimeSlots } from "./domains/storefront/ordering/timeslots.routes.js";
import { routesCustomerAuth } from "./domains/storefront/customer/auth.routes.js";
import { routesCustomerProfile } from "./domains/storefront/customer/profile.routes.js";
import { routesCustomerAddresses } from "./domains/storefront/customer/addresses.routes.js";
import { routesCustomerOrders } from "./domains/storefront/customer/orders.routes.js";
import { routesCustomerFavorites } from "./domains/storefront/customer/favorites.routes.js";
import { routesPublicOrders } from "./domains/storefront/ordering/orders.routes.js";
import { routesStorefrontConfig } from "./domains/storefront/config.routes.js";
import { routesMedia } from "./domains/storefront/media.routes.js";
import { routesJournal } from "./domains/storefront/journal.routes.js";
import { routesPayments } from "./domains/storefront/payments.routes.js";
import { routesAdmin } from "./domains/admin/admin.routes.js";
import { metricsRoutes } from "./domains/infra/metrics.routes.js";
import internalRoutes from "./domains/internal/internal.routes.js";
import domainsRoutes from "./domains/super-admin/domains.routes.js";
import { httpRequestDuration } from "./lib/metrics.js";
import { logger } from "./lib/logger.js";
import { createRedisClient, getBullMqConnectionFromEnv, resolveRedisUrlFromEnv } from "./lib/redis-client.js";
import { requestLoggerPlugin } from "./plugins/request-logger.js";
import { rawBodyPlugin } from "./plugins/raw-body.js";
import { healthRoutes } from "./domains/infra/health.routes.js";
import { webhooksRoutes } from "./domains/infra/webhooks.routes.js";
import { createMetrics } from "./observability/metrics.js";
import { initSentry, captureError } from "./observability/sentry.js";
import { authPlugin } from "./plugins/auth.js";
import { createPaymentsQueue, type PaymentsQueue } from "./services/payments/payments-queue.js";
import { routesInternalPayments } from "./domains/internal/internal-payments.routes.js";
import { PaymentsWorkerFactory } from "./services/payments/payments-worker.js";
import { startPaymentsSweepers, type PaymentsSweeper } from "./services/payments/sweepers.js";

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "") return defaultValue;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return defaultValue;
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : defaultValue;
}

function envIntRange(args: { name: string; def: number; min: number; max: number }): number {
  const raw = process.env[args.name];
  if (raw == null || raw.trim() === "") return args.def;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < args.min || n > args.max) {
    logger.warn({ name: args.name, value: raw, min: args.min, max: args.max, fallback: args.def }, "[STARTUP] Invalid env value");
    return args.def;
  }
  return n;
}



let cfg = loadConfig(process.env);

// Hardening: Production Secrets Safety Check
if (process.env.NODE_ENV === "production") {
  const unsafeJwt = "super-secret-jwt-key-change-me";
  const unsafeCookie = "super-secret-cookie-key-change-me";

  if (cfg.JWT_SECRET === unsafeJwt || cfg.COOKIE_SECRET === unsafeCookie) {
    logger.fatal({
      env: process.env.NODE_ENV,
      issue: 'DEFAULT_SECRETS_IN_PRODUCTION',
      jwtSecret: cfg.JWT_SECRET === unsafeJwt ? 'UNSAFE' : 'OK',
      cookieSecret: cfg.COOKIE_SECRET === unsafeCookie ? 'UNSAFE' : 'OK'
    }, 'CRITICAL: Production running with default insecure secrets');
    process.exit(1);
  }
}

// Optional Sentry
initSentry(cfg.SENTRY_DSN);

// Optional Metrics
const metrics = cfg.METRICS_ENABLED ? createMetrics() : undefined;

const app = Fastify({
  // CRITICAL: Trust proxy headers (X-Forwarded-For) when behind reverse proxy
  // Without this, req.ip will be the proxy's IP (Cloudflare/Nginx), not the real user
  // This would cause rate limiting to block ALL users if one attacker triggers it
  trustProxy: true,
  // We define explicit HEAD routes where needed (e.g. /media).
  // Disable automatic HEAD generation to avoid duplicate route errors.
  exposeHeadRoutes: false,
  logger: {
    level: cfg.LOG_LEVEL,
    redact: {
      // Do not leak PII / secrets into logs
      paths: [
        "req.headers.authorization",
        "req.headers.cookie",
        "req.headers.x-internal-secret",
        "req.body.phone",
        "req.body.address",
        "req.body.comment",
        "req.body.note",
      ],
      remove: true,
    },
  },
  requestIdHeader: "x-request-id",
});

// ============================================
// PHASE 9: GLOBAL ZOD INTEGRATION
// ============================================
// CRITICAL: Set Zod compilers for schema validation and serialization
// This enables routes to use Zod schemas in their `schema` property
// and allows Swagger to generate proper API documentation from Zod schemas
app.setValidatorCompiler(validatorCompiler);
app.setSerializerCompiler(serializerCompiler);

import fjwt from "@fastify/jwt";
import fcookie from "@fastify/cookie";

// ============================================
// CORE PLUGIN REGISTRATION
// ============================================

// CORS - Cross-Origin Resource Sharing
const allowedOrigin = process.env.WEB_BASE_URL || "http://localhost:3000";
await app.register(cors, {
  origin: [allowedOrigin, "http://localhost:3000", "http://127.0.0.1:3000"],
  credentials: true
});

// ============================================
// PHASE 8: PRODUCTION HARDENING & DOCUMENTATION
// ============================================

// 1. Swagger (OpenAPI) - Documentation Engine
// CRITICAL: Must be registered BEFORE SwaggerUI
await app.register(swagger, {
  openapi: {
    info: {
      title: 'Vendora BFF',
      description: 'Backend for Frontend - Multi-tenant platform',
      version: '1.0.0'
    },
    servers: [
      {
        url: process.env.BFF_BASE_URL || 'http://localhost:4000',
        description: 'BFF Server'
      }
    ]
  },
  transform: jsonSchemaTransform // CRITICAL: Enables Swagger to read Zod schemas
});

// 2. Swagger UI - Visual Documentation Interface
await app.register(swaggerUi, {
  routePrefix: '/documentation',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true
  },
  staticCSP: true,
  transformStaticCSP: (header) => header
});

// 3. Helmet - Security Headers
// CRITICAL: CSP disabled to prevent blocking Swagger UI inline scripts
await app.register(helmet, {
  global: true,
  contentSecurityPolicy: false, // Required for Swagger UI to work
  strictTransportSecurity: process.env.NODE_ENV === 'production' ? {
    maxAge: 31536000, // 1 year
    includeSubDomains: true,
    preload: true
  } : false,
  xFrameOptions: { action: 'deny' }
});

// 4. Compression - Response Optimization
await app.register(compress, { global: true });

// ============================================
// AUTHENTICATION & SESSION
// ============================================

// JWT - JSON Web Token Authentication
await app.register(fjwt, {
  secret: cfg.JWT_SECRET,
  sign: { expiresIn: "7d" },
  cookie: {
    cookieName: "auth_token",
    signed: false, // We use JWT verification instead of cookie signing for simplicity here, or we can sign it.
    // If we want httpOnly cookie automatically set by reply.jwtSign, we configure it here.
  }
});

// Cookie Parsing & Signing
await app.register(fcookie, {
  secret: cfg.COOKIE_SECRET,
  hook: "onRequest",
});

let rateLimitRedis: Redis | undefined;
if (cfg.CACHE_MODE === "redis" && cfg.REDIS_URL) {
  rateLimitRedis = createRedisClient("rate-limit", undefined, cfg.REDIS_URL);
}

import { isValidInternalSecret } from "./lib/internal-auth.js";

// 5. Rate Limit - Request Throttling
// PHASE 9: Tenant-Aware Rate Limiting
// Uses x-tenant-slug for fairness: if one tenant is DDoS'd, others are unaffected
await app.register(rateLimit, {
  max: cfg.RATE_LIMIT_MAX,
  timeWindow: cfg.RATE_LIMIT_WINDOW_MS,
  redis: rateLimitRedis,
  keyGenerator: (req) => {
    // 🔒 Internal API Isolation: Valid internal requests get their own bucket
    // This prevents public traffic (IP-based) from blocking middleware calls
    if (isValidInternalSecret(req)) {
      const query = req.query as { domain?: string };
      const domain = query.domain?.trim().toLowerCase();
      // Use domain-specific internal key if possible, otherwise generic internal key
      // NEVER fallback to IP for valid internal requests to avoid collapse
      return domain ? `internal:${domain}` : `internal:missing-domain`;
    }

    // Primary: Use tenant slug from header for multi-tenant fairness
    const tenantSlug = req.headers['x-tenant-slug'];
    if (tenantSlug && typeof tenantSlug === 'string') {
      return `tenant:${tenantSlug} `;
    }
    // Fallback: Use IP for routes without tenant context (e.g., /super)
    return `ip:${req.ip} `;
  }
});

// STEP 1: Register Request Logger Plugin (must be before routes)
// Adds requestId to every request and enables structured logging with req.log
await requestLoggerPlugin(app);

// STEP 1.1: Raw body capture for signature verification routes (e.g. /webhooks/*)
await rawBodyPlugin(app);

// Auth Decorator REMOVED - Logic moved to authPlugin



// expose request id
app.addHook("onRequest", async (req, reply) => {
  // Fastify request ID is runtime-decorated property
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  reply.header("x-request-id", (req as any).id);
  // Custom timing property - runtime decoration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).__t0 = process.hrtime.bigint();
});

app.addHook("onResponse", async (req, reply) => {
  if (!metrics) return;
  // Custom timing property - runtime decoration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const t0 = (req as any).__t0 as bigint | undefined;
  if (!t0) return;
  const dt = Number(process.hrtime.bigint() - t0) / 1e9; // seconds
  const route = (req.routeOptions && (req.routeOptions.url as string)) || "unknown";
  metrics.httpDuration.observe({ method: req.method, route, status: String(reply.statusCode) }, dt);
});

// HTTP Request Duration Instrumentation (for new Prometheus metrics)
// Track ALL API requests for performance monitoring
app.addHook('onRequest', async (req) => {
  // Custom timing property - runtime decoration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (req as any).httpStartTime = Date.now();
});

app.addHook('onResponse', async (req, reply) => {
  // Custom timing property - runtime decoration
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const startTime = (req as any).httpStartTime;
  if (startTime) {
    const duration = (Date.now() - startTime) / 1000;
    const route = (req.routeOptions && req.routeOptions.url) || 'unknown';

    httpRequestDuration.observe({
      method: req.method,
      route,
      status_code: String(reply.statusCode)
    }, duration);
  }
});


// Global error handler (keeps responses safe + reports)
// Global error handler (keeps responses safe + reports)
import { BusinessError } from "./errors/business-error.js";
import { UpstreamHttpError } from "./services/http.js";

// Fastify error handler - error type is runtime-dependent
// eslint-disable-next-line @typescript-eslint/no-explicit-any
app.setErrorHandler((err: any, req: FastifyRequest, reply) => {
  // Request logger is runtime-decorated  
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const reqLog = (req as any).log || logger;
  // Request ID is runtime-decorated
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const requestId = (req as any).requestId || req.id;

  // Tenant-specific responses: never cache errors for /config and /branches (audit 3.7, 3.10)
  // Match /config, /config/*, /branches, /branches/* only — not /configX or /branchesX
  const path = (req.url ?? "").split("?")[0] ?? "";
  if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
    reply.header("Cache-Control", "private, no-store");
  }

  // 1. Validations (Fastify / Zod)
  if (err.validation) {
    reqLog.info({
      error: err.message,
      validation: err.validation
    }, 'Validation error');
    return reply.code(400).send({
      error: "Validation Error",
      message: err.message,
      details: err.validation,
      requestId
    });
  }

  // 2. Business Logic Errors
  if (err instanceof BusinessError) {
    reqLog.info({
      code: err.code,
      message: err.message
    }, 'Business error');
    return reply.code(err.statusCode).send({
      error: err.code,
      message: err.message,
      details: err.details,
      requestId
    });
  }

  // 3. Prisma Database Errors
  // SECURITY FIX: Catch Prisma errors and prevent schema leaks
  if (err.code && typeof err.code === 'string' && err.code.startsWith('P')) {
    // P2025: Record not found
    if (err.code === 'P2025') {
      reqLog.info({ url: (req.url ?? "").split("?")[0] ?? "" }, 'Resource not found (Prisma)');
      return reply.code(404).send({
        error: "Not Found",
        message: "Resource not found",
        requestId
      });
    }

    // P2002: Unique constraint failed
    if (err.code === 'P2002') {
      reqLog.warn({
        fields: err.meta?.target
      }, 'Unique constraint violation');
      return reply.code(409).send({
        error: "Conflict",
        message: "Resource already exists",
        details: { fields: err.meta?.target },
        requestId
      });
    }

    // Other Prisma errors (P*) -> 500 but Safe
    reqLog.error({
      error: {
        message: err.message,
        code: err.code,
        meta: err.meta,
        stack: err.stack
      },
      // Tenant and user are runtime-decorated by plugins
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tenantId: (req as any).tenant?.id,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      userId: (req as any).user?.userId
    }, 'Prisma database error');

    captureError(err);

    return reply.code(500).send({
      error: "Database operation failed",
      requestId
    });
  }

  // 4. JWT / Auth Errors
  if (err.statusCode === 401 || err.code === 'FST_JWT_NO_AUTHORIZATION_IN_HEADER' || err.code === 'FST_JWT_AUTHORIZATION_TOKEN_EXPIRED') {
    return reply.code(401).send({
      error: "Unauthorized",
      message: "Invalid or expired token",
      requestId
    });
  }

  // 5. Explicit 404 from other parts
  if (err.statusCode === 404 || (err.message && err.message.toLowerCase().includes("not found"))) {
    reqLog.info({ statusCode: 404, url: (req.url ?? "").split("?")[0] ?? "" }, 'Resource not found');
    return reply.code(404).send({
      error: "Not found",
      requestId
    });
  }

  // 6. Rate Limit Handling (429)
  if (err.statusCode === 429) {
    reqLog.warn({ statusCode: 429, url: (req.url ?? "").split("?")[0] ?? "" }, 'Rate limit exceeded');
    return reply.code(429).send({
      error: "Too Many Requests",
      message: err.message || "Rate limit exceeded",
      requestId
    });
  }

  // 7. Upstream HTTP Errors
  if (err instanceof UpstreamHttpError) {
    reqLog.warn({
      upstreamStatus: err.status,
      upstreamUrl: err.url,
      upstreamMethod: err.method,
      isTimeout: err.isTimeout,
      op: err.op
    }, 'Upstream HTTP error');
    
    if (err.status === 404) {
      return reply.code(404).send({
        error: "Upstream failure",
        requestId
      });
    }
    
    return reply.code(502).send({
      error: "Upstream failure",
      requestId
    });
  }

  // 6. Generic Fallback (The Security Guardrail)
  // CRITICAL: Never leak err.stack to client
  reqLog.error({
    error: {
      message: err.message,
      stack: err.stack,
      statusCode: err.statusCode,
      code: err.code
    },
    // Tenant and user are runtime-decorated by plugins
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tenantId: (req as any).tenant?.id,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    userId: (req as any).user?.userId
  }, 'Unhandled request error');

  captureError(err);

  reply.code(502).send({
    error: "Internal Server Error",
    message: "An unexpected error occurred",
    requestId
  });
});

// 404 "route not found" (e.g. GET /config/ with trailing slash) — set Cache-Control for tenant paths only (audit 3.7)
app.setNotFoundHandler((req, reply) => {
  const pathRaw = (req.url ?? "").split("?")[0] ?? "";
  const path = pathRaw.replace(/\/$/, "") || "/";
  // Match /config, /config/*, /branches, /branches/* only — do not set Cache-Control for other 404s
  if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
    reply.header("Cache-Control", "private, no-store");
  }
  // requestId: canonical key — Fastify req.id (set from requestIdHeader or genReqId)
  const requestId = String(req.id ?? "");
  return reply.code(404).send({ error: "Not found", requestId });
});

// Optional: auto-discover upstream endpoints (useful when upstream API paths are unknown)
if (cfg.UPSTREAM_MODE === "http" && cfg.UPSTREAM_DISCOVERY_ENABLED && cfg.UPSTREAM_BASE_URL) {
  try {
    // Config JSON is validated at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const candidates = cfg.UPSTREAM_DISCOVERY_CANDIDATES_JSON as any;

    const report = await discoverUpstreamEndpoints({
      baseUrl: cfg.UPSTREAM_BASE_URL,
      branchSlug: cfg.UPSTREAM_DISCOVERY_BRANCH_SLUG,
      timeoutMs: cfg.UPSTREAM_DISCOVERY_TIMEOUT_MS,
      candidates,
    });
    // discovery variable removed as unused

    // Merge discovered endpoints into effective config for this process
    cfg = {
      ...cfg,
      // Endpoints structure is validated at runtime
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      upstreamEndpoints: { ...cfg.upstreamEndpoints, ...(report.endpoints as any) },
    };

    if (cfg.UPSTREAM_DISCOVERY_WRITE_FILE && cfg.UPSTREAM_DISCOVERY_SAVE_PATH) {
      await writeDiscoveryFile(cfg.UPSTREAM_DISCOVERY_SAVE_PATH, report.endpoints);
    }
  } catch (e) {
    // Error type unknown at runtime
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    // discovery = { enabled: true, error: (e as any)?.message || String(e) };
  }
}

const cache = await createCache({ mode: cfg.CACHE_MODE, redisUrl: cfg.REDIS_URL });
const upstream = createUpstream(cfg, metrics);
// We use the configured UPSTREAM_BASE_URL for the payment callback if strictly server-side, 
// but here we need the FRONTEND URL. For now, we'll assume localhost:3000 if not provided in env, 
// or maybe we should reuse `origin` from somewhere. 
// Let's assume WEB_BASE_URL env or default to http://localhost:3000
// Moved paymentService creation down to inject eventBus
const webBase = process.env.WEB_BASE_URL || "http://localhost:3000";

// ============================================
// CACHE CLUSTERING (Distributed Invalidation)
// ============================================
import { PubSubService } from "./services/pubsub.js";

let pubsub: PubSubService | undefined;
const pubsubEnabled = envBool("PUBSUB_ENABLED", true);
if (pubsubEnabled && cfg.REDIS_URL) {
  // Only enable Distributed Invalidation if Redis is available
  pubsub = new PubSubService(cfg.REDIS_URL, cache);
  await pubsub.connect(); // Start listening
  logger.info("[PubSub] Distributed Invalidation Service started");
} else if (!pubsubEnabled) {
  logger.info("[PubSub] Disabled via PUBSUB_ENABLED=false");
}

// ============================================
// PHASE 2: VENDORA EVENT BUS (BullMQ)
// ============================================
import { EventBus } from "./services/event-bus/bus.js";
import { WorkerFactory } from "./services/event-bus/worker.js";

let eventBus: EventBus | undefined;
let workerFactory: WorkerFactory | undefined;
let paymentsQueue: PaymentsQueue | undefined;
let paymentsWorkerFactory: PaymentsWorkerFactory | undefined;
let paymentsSweeper: PaymentsSweeper | undefined;

// RESOLUTION: Support both modern REDIS_URL and legacy REDIS_HOST/PORT
const bullmqConn = getBullMqConnectionFromEnv();
const resolvedRedisUrl = resolveRedisUrlFromEnv();
// Legacy: EVENT_BUS_ENABLED controlled both publisher + worker.
// New: EVENT_BUS_QUEUE_ENABLED (publisher) and EVENT_BUS_WORKER_ENABLED (consumer).
const legacyEventBusEnabled = envBool("EVENT_BUS_ENABLED", true);
const eventBusQueueEnabled = envBool("EVENT_BUS_QUEUE_ENABLED", legacyEventBusEnabled);
const eventBusWorkerEnabled = envBool("EVENT_BUS_WORKER_ENABLED", legacyEventBusEnabled);
const allowQueueWithoutWorker = envBool("ALLOW_QUEUE_WITHOUT_WORKER", false);
const bullmqConfigured = Boolean(bullmqConn && resolvedRedisUrl);

logger.info(
  {
    bullmqConfigured,
    legacyEventBusEnabled,
    eventBusQueueEnabled,
    eventBusWorkerEnabled,
    allowQueueWithoutWorker,
  },
  "[STARTUP] EventBus flags"
);

// Production guardrail: prevent silent job backlog when publishing is enabled but consumer is disabled.
if (process.env.NODE_ENV === "production" && bullmqConfigured) {
  if (eventBusQueueEnabled && !eventBusWorkerEnabled && !allowQueueWithoutWorker) {
    throw new Error(
      "[Vendora EventBus] Misconfigured: publisher enabled but worker disabled. Set EVENT_BUS_WORKER_ENABLED=true or EVENT_BUS_QUEUE_ENABLED=false, or set ALLOW_QUEUE_WITHOUT_WORKER=true if intentional."
    );
  }
}

// Publisher (Queue)
if (eventBusQueueEnabled && bullmqConfigured) {
  eventBus = new EventBus(bullmqConn!);
} else if (!eventBusQueueEnabled) {
  logger.info("[Vendora EventBus] Publisher disabled via EVENT_BUS_QUEUE_ENABLED=false");
} else {
  logger.warn("[Vendora EventBus] Publisher skipped (REDIS_URL not set)");
}

// Consumer (Worker)
if (eventBusWorkerEnabled && bullmqConfigured) {
  // MVP: Run in same process (Monolith Execution)
  workerFactory = new WorkerFactory(bullmqConn!);

  // Register Domain Handlers (Loader Pattern)
  import("./services/event-bus/loader.js").then(({ registerEventHandlers }) => {
    if (workerFactory) registerEventHandlers(workerFactory, {}); // Pass deps if needed later
  });

  // Start processing
  workerFactory.start();
} else if (!eventBusWorkerEnabled) {
  logger.info("[Vendora EventBus] Worker disabled via EVENT_BUS_WORKER_ENABLED=false");
} else {
  logger.warn("[Vendora EventBus] Worker skipped (REDIS_URL not set)");
}

const paymentsQueueEnabled = envBool("PAYMENTS_QUEUE_ENABLED", true);
if (paymentsQueueEnabled && bullmqConn && resolvedRedisUrl) {
  paymentsQueue = createPaymentsQueue(bullmqConn);
} else if (!paymentsQueueEnabled) {
  logger.info("[PaymentsQueue] Disabled via PAYMENTS_QUEUE_ENABLED=false");
} else {
  logger.warn("[PaymentsQueue] Redis not configured; payments queue disabled");
}

const paymentsWorkerEnabled = envBool("PAYMENTS_WORKER_ENABLED", true);
if (paymentsWorkerEnabled && paymentsQueueEnabled && bullmqConn && resolvedRedisUrl) {
  const concurrency = envIntRange({ name: "PAYMENTS_WORKER_CONCURRENCY", def: 1, min: 1, max: 10 });
  const drainDelaySec = envIntRange({ name: "PAYMENTS_WORKER_DRAIN_DELAY_SEC", def: 10, min: 1, max: 60 });
  const stalledIntervalMs = envIntRange({ name: "PAYMENTS_WORKER_STALLED_INTERVAL_MS", def: 120_000, min: 30_000, max: 600_000 });

  logger.info(
    { concurrency, drainDelaySec, stalledIntervalMs },
    "[STARTUP] Payments worker tuning"
  );

  paymentsWorkerFactory = new PaymentsWorkerFactory({ connection: bullmqConn, concurrency, drainDelaySec, stalledIntervalMs });
  paymentsWorkerFactory.start({ prisma, secrets: envSecretResolver(), paymentsQueue });
} else if (!paymentsWorkerEnabled) {
  logger.info("[PaymentsWorker] Disabled via PAYMENTS_WORKER_ENABLED=false");
} else if (!paymentsQueueEnabled) {
  logger.info("[PaymentsWorker] Skipped (PAYMENTS_QUEUE_ENABLED=false)");
} else {
  logger.warn("[PaymentsWorker] Skipped (Redis not configured)");
}

const paymentsSweeperEnabled = envBool("PAYMENTS_SWEEPER_ENABLED", true);
if (paymentsSweeperEnabled && paymentsQueue) {
  const intervalMs = envInt("PAYMENTS_SWEEPER_INTERVAL_MS", 5 * 60_000);
  const batchSize = envInt("PAYMENTS_SWEEPER_BATCH_SIZE", 100);
  const backlogMetricsIntervalMs = envInt("PAYMENTS_SWEEPER_BACKLOG_METRICS_INTERVAL_MS", 15 * 60_000);
  paymentsSweeper = startPaymentsSweepers({ prisma, paymentsQueue, intervalMs, batchSize, backlogMetricsIntervalMs });
} else if (!paymentsSweeperEnabled) {
  logger.info("[PaymentsSweeper] Disabled via PAYMENTS_SWEEPER_ENABLED=false");
} else {
  logger.warn("[PaymentsSweeper] Skipped (payments queue disabled)");
}

// Re-ordered Service Creation (Dependency Injection)
const paymentService = createPaymentService(webBase);

import { routesAuth } from "./domains/auth/auth.routes.js";


// Step 3 deps: upstream fetch + cache (TTL + serve-stale + SWR) + metrics
const deps = {
  cache,
  pubsub, // Added pubsub for distributed invalidation
  upstream,
  paymentService,
  prisma, // Added prisma
  config: cfg, // Added config
  ttlSec: cfg.CACHE_TTL_SECONDS,
  staleSec: cfg.CACHE_STALE_SECONDS,
  swr: cfg.CACHE_SWR_ENABLED,
  metrics,
  idemTtlSec: cfg.IDEMPOTENCY_TTL_SECONDS,
  orderTtlSec: cfg.ORDER_TTL_SECONDS,
  orderUpstream: cfg.ORDER_UPSTREAM_ENABLED,
  quoteCache: { ttlSec: cfg.CACHE_TTL_SECONDS, staleSec: cfg.CACHE_STALE_SECONDS }, // Added quoteCache
  eventBus, // Phase 2: Injected Event Bus
};

import fmultipart from "@fastify/multipart";
import { routesUpload } from "./domains/admin/media/media.routes.js";
import { tenantGuardPlugin } from "./plugins/tenant-guard.js";
import { adminWriteContextPlugin } from "./plugins/admin-write-context.js";
import { adminPermissionGuardPlugin } from "./plugins/admin-permission-guard.js";
import { tenantContextPlugin } from "./plugins/tenant-context.js";
import { routesSuperAdmin } from "./domains/super-admin/tenants.routes.js";
import { routesSuperPaymentProviders } from "./domains/super-admin/payment-providers.routes.js";
import { envSecretResolver } from "./services/secrets.js";

// ============================================
// LAYERED SECURITY ARCHITECTURE
// ============================================
// Layer 1: Core Infrastructure (CORS, JWT, multipart, tenant context) - ALREADY REGISTERED ABOVE
// Layer 2: Public Routes (NO GUARDS)
// Layer 3: Super Admin (JWT ONLY - NO TENANT GUARD)
// Layer 4: Tenant Protected Area (JWT + TENANT GUARD)

// LAYER 1: Core Infrastructure
// Register multipart for file uploads
await app.register(fmultipart, {
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit (R2 proxy plan)
  }
});

// Register Tenant Context Plugin (resolves tenant from x-tenant-slug header)
// CRITICAL: This must be registered globally BEFORE routes to ensure tenant context is available
await tenantContextPlugin(app);

// LAYER 1.5: Internal API Routes (Protected by shared secret)
// These routes are used for internal service communication (e.g., Next.js middleware)
await app.register(internalRoutes);
const secrets = envSecretResolver();
await routesInternalPayments(app, { prisma, paymentsQueue, secrets });

// LAYER 2: Public Routes (NO GUARDS)
// These routes are accessible without JWT authentication
// They may optionally use tenant context from subdomain
await routesAuth(app, deps);
await routesBranches(app, deps);
await routesMenu(app, deps);        // Customer-facing menu (public)
await routesDelivery(app, deps);   // Customer-facing delivery info (public)
await routesCheckout(app, deps);   // Checkout (supports both guest and authenticated)
await routesPublicOrders(app, deps); // Public Order Status
await routesTimeSlots(app, deps);  // Time slots generation for scheduled orders
await routesCustomerAuth(app, deps); // Customer OTP Auth
await routesJournal(app, deps); // Journal (public)
await routesMedia(app, deps); // Public media proxy (/media)
await routesPayments(app, deps); // Payments V2 checkout (storefront)
await webhooksRoutes(app, { prisma, secrets, paymentsQueue }); // Public webhooks ingress (no tenant header)

// Customer Routes (Protected - require JWT)
// Grouped under /customer prefix
await app.register(async (customerScope) => {
  // Apply customer JWT authentication
  await customerScope.register(authPlugin, { role: "customer" });

  await routesCustomerProfile(customerScope, deps); // GET/PATCH /customer/me
  await routesCustomerAddresses(customerScope, deps); // GET/POST/DELETE /customer/addresses
  await routesCustomerOrders(customerScope); // GET /customer/orders, POST /customer/orders/:id/repeat
}, { prefix: '/customer' });

await routesCustomerFavorites(app, deps); // Customer Favorites

// Storefront Config (Public)
await app.register(routesStorefrontConfig, { prefix: "/config" });

// LAYER 2.5: Observability Endpoints (Public - No Auth)
await healthRoutes(app);           // Health check with DB connectivity test
await metricsRoutes(app);          // Prometheus metrics exposition




// LAYER 3: Super Admin (JWT ONLY - NO TENANT GUARD)
// Super admin operates above tenant boundaries
// Requires JWT but should NOT be blocked by tenant guard
await app.register(async (superScope) => {
  // Apply JWT verification to all routes in this scope
  // Apply Global Auth Guard for Super Admin (Layer 3)
  await superScope.register(authPlugin, { role: "super-admin" });


  // Register super admin routes
  await superScope.register(domainsRoutes, { prefix: '/tenants' });
  await superScope.register(async (tenantsScope) => {
    await routesSuperPaymentProviders(tenantsScope, { prisma });
  }, { prefix: "/tenants" });
  await superScope.register(routesSuperAdmin);
}, { prefix: "/super" });

// LAYER 4: Tenant Protected Area (JWT + TENANT GUARD)
// Business logic routes that require both JWT authentication AND active tenant
await app.register(async (tenantScope) => {
  // Apply JWT verification first
  // Apply Global Auth Guard for Tenant (Layer 4)
  // We require Tenant Context by default here
  await tenantScope.register(authPlugin, { requireTenant: true });



  // Apply tenant guard (checks tenant is active)
  await tenantScope.register(tenantGuardPlugin, { prisma });

  // ACCESS_LEVELS: DB-check on write — fresh adminContext from DB for POST/PUT/PATCH/DELETE
  await tenantScope.register(adminWriteContextPlugin, { prisma });

  // ACCESS_LEVELS Phase 3: guard — Gate №1, permission, ownerOnly, capability (deny-by-default)
  await tenantScope.register(adminPermissionGuardPlugin, { prisma });

  // Register all protected business logic routes (admin, uploads)
  await routesAdmin(tenantScope, deps);
  await routesUpload(tenantScope);
}, { prefix: '/admin' });

const port = Number(cfg.PORT || 4000);
// Fly private networking (`*.internal`) resolves to IPv6; bind to IPv6 to allow web -> bff.internal calls.
const host = process.env.LISTEN_HOST || "::";
app.listen({ port, host }).then(() => {
  app.log.info(
    `🚀 Server ${process.env.NODE_ENV === "production" ? "(PRODUCTION)" : ""} ready at http://localhost:${port}`
  );
  app.log.info(`📚 GraphQL playground at http://localhost:${port}/graphql`);
  app.log.info(`📝 Swagger UI at http://localhost:${port}/documentation`);

  // Start background jobs
  if (process.env.NODE_ENV !== 'test') {
    const domainCronEnabled = envBool("DOMAIN_VERIFICATION_CRON_ENABLED", true);
    if (domainCronEnabled && cfg.REDIS_URL) {
      import('./services/domain-verification-cron.js').then(({ startDomainVerificationCron }) => {
        startDomainVerificationCron();
      }).catch((err) => {
        app.log.error({ err }, "[STARTUP] Domain verification cron failed to start");
      });
    } else if (!domainCronEnabled) {
      app.log.info("[STARTUP] Domain verification cron disabled via DOMAIN_VERIFICATION_CRON_ENABLED=false");
    } else {
      app.log.warn("[STARTUP] Domain verification cron skipped (REDIS_URL not set)");
    }

    // Phase 3.1: Transactional Outbox Relay
    const outboxRelayEnabled = envBool("OUTBOX_RELAY_ENABLED", true);
    if (eventBus && outboxRelayEnabled && cfg.REDIS_URL) {
      const pollIntervalMs = envInt("OUTBOX_RELAY_POLL_INTERVAL_MS", 15_000);
      const lockTtlSeconds = envInt("OUTBOX_RELAY_LOCK_TTL_SECONDS", 30);
      import('./services/outbox/relay.js').then(({ startOutboxRelay }) => {
        startOutboxRelay(eventBus!, metrics, { pollIntervalMs, lockTtlSeconds });
      }).catch((err) => {
        app.log.error({ err }, "[STARTUP] Outbox relay failed to start");
      });
    } else if (eventBus && !outboxRelayEnabled) {
      app.log.info("[STARTUP] Outbox relay disabled via OUTBOX_RELAY_ENABLED=false");
    }

    // Warm cache after startup (100x faster with pipelining)
    const cacheWarmerEnv = process.env.CACHE_WARMER_ENABLED;
    const cacheWarmerEnabled = envBool("CACHE_WARMER_ENABLED", false);
    if (cacheWarmerEnabled && cfg.REDIS_URL) {
      import('./services/cache-warmer.js').then(({ warmDomainCache }) => {
        warmDomainCache().catch(err => {
          app.log.error({ err }, '[STARTUP] Cache warming failed');
        });
      }).catch((err) => {
        app.log.error({ err }, "[STARTUP] Cache warmer failed to start");
      });
    } else if (cacheWarmerEnv != null && !cacheWarmerEnabled) {
      app.log.info("[STARTUP] Cache warmer disabled via CACHE_WARMER_ENABLED=false");
    } else {
      if (cacheWarmerEnabled) app.log.warn("[STARTUP] Cache warmer skipped (REDIS_URL not set)");
    }

    // Phase 4 DoD: missing_offer metric (0=normal, >0=alert)
    const missingOfferMetricEnabled = envBool("MISSING_OFFER_METRIC_ENABLED", true);
    if (metrics && missingOfferMetricEnabled) {
      const intervalMs = envInt("MISSING_OFFER_METRIC_INTERVAL_MS", 15 * 60_000);
      const startupDelayMs = envInt("MISSING_OFFER_METRIC_STARTUP_DELAY_MS", 30_000);
      import('./services/missing-offer-metric.js').then(({ startMissingOfferMetricJob }) => {
        startMissingOfferMetricJob(prisma, metrics.missingOffer, { intervalMs, startupDelayMs });
      });
    } else if (metrics && !missingOfferMetricEnabled) {
      app.log.info("[STARTUP] missing_offer metric job disabled via MISSING_OFFER_METRIC_ENABLED=false");
    }
  }
});

// Graceful shutdown
async function closeGracefully(signal: string) {
  app.log.info(`Received ${signal}, shutting down...`);
  await app.close();
  if (eventBus) await eventBus.close();
  if (workerFactory) await workerFactory.close();
  if (paymentsWorkerFactory) await paymentsWorkerFactory.close();
  if (paymentsSweeper) paymentsSweeper.close();
  if (paymentsQueue) await paymentsQueue.close();
  if (pubsub) await pubsub.close(); // Close PubSub connection
  await cache.close();
  if (rateLimitRedis) await rateLimitRedis.quit();
  process.exit(0);
}

// ============================================
// PHASE 10: PROCESS SAFETY NET ("The Silent Killer" Mitigation)
// ============================================
// CRITICAL: Prevent the Monolith from crashing due to background worker failures.
// In a Monolith, a single unhandled rejection in a BullMQ worker (running in the same process)
// will kill the entire HTTP server by default in Node.js 18+.
// We MUST catch these to keep the API alive for other users.

// Promise rejection reason can be any type at runtime
// eslint-disable-next-line @typescript-eslint/no-unused-vars
process.on("unhandledRejection", (reason, promise) => {
  logger.error({
    err: reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason,
    type: "UNHANDLED_REJECTION"
  }, "🚨 CRITICAL: Unhandled Promise Rejection. Process will NOT exit.");

  // Sentry or other APM would go here
  captureError(reason);
});

process.on("uncaughtException", (error) => {
  logger.fatal({
    err: { message: error.message, stack: error.stack },
    type: "UNCAUGHT_EXCEPTION"
  }, "💀 FATAL: Uncaught Exception. Process is unstable and will shut down.");

  captureError(error);

  // Give logger time to flush (best effort), then die
  closeGracefully("UNCAUGHT_EXCEPTION");
});


process.on("SIGTERM", () => closeGracefully("SIGTERM"));
process.on("SIGINT", () => closeGracefully("SIGINT"));
