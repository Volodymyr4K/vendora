/**
 * Prometheus Metrics Library
 * 
 * Production observability for multi-tenant SaaS platform.
 * Tracks:
 * - Tenant resolution cache performance (Phase 5)
 * - Security events - JWT mismatches (Phase 3)
 * - HTTP request performance
 * - Tenant operations
 */

import { Registry, Counter, Histogram, Gauge } from 'prom-client';

// Create registry
export const register = new Registry();

/**
 * Tenant Cache Hits
 * 
 * Tracks successful cache hits for tenant resolution.
 * Labels: tenant_id
 * 
 * Use: Monitor Phase 5 cache effectiveness
 */
export const tenantCacheHits = new Counter({
    name: 'tenant_cache_hits_total',
    help: 'Total number of tenant resolution cache hits',
    labelNames: ['tenant_id'],
    registers: [register]
});

/**
 * Tenant Cache Misses
 * 
 * Tracks cache misses (DB queries needed).
 * 
 * Use: Monitor when tenant resolution goes to database
 */
export const tenantCacheMisses = new Counter({
    name: 'tenant_cache_misses_total',
    help: 'Total number of tenant resolution cache misses (DB queries)',
    registers: [register]
});

/**
 * Tenant Resolution Duration
 * 
 * Tracks how long tenant resolution takes (cache or DB).
 * Buckets: 1ms, 5ms, 10ms, 50ms, 100ms
 * 
 * Use: Monitor tenant resolution performance
 * Expected: <1ms for cache hits, 5-10ms for DB queries
 */
export const tenantResolutionDuration = new Histogram({
    name: 'tenant_resolution_duration_seconds',
    help: 'Duration of tenant resolution in seconds',
    buckets: [0.001, 0.005, 0.01, 0.05, 0.1],
    registers: [register]
});

/**
 * Tenant Mismatch Errors (Security)
 * 
 * Tracks confused deputy attack attempts (Phase 3).
 * Labels: user_id, jwt_tenant_id, header_tenant_id
 * 
 * Use: Security monitoring - detect malicious access attempts
 * Alert: If this metric increases, investigate potential attacks
 */
export const tenantMismatchErrors = new Counter({
    name: 'tenant_mismatch_errors_total',
    help: 'Total number of JWT tenant mismatch errors (confused deputy attempts)',
    labelNames: ['user_id', 'jwt_tenant_id', 'header_tenant_id'],
    registers: [register]
});

/**
 * HTTP Request Duration
 * 
 * Tracks API request performance.
 * Labels: method, route, status_code
 * Buckets: 10ms, 50ms, 100ms, 500ms, 1s, 5s
 * 
 * Use: Monitor API performance and identify slow endpoints
 */
export const httpRequestDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Duration of HTTP requests in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
    registers: [register]
});

/**
 * Cache Hit Rate Helper
 * 
 * Calculate cache hit rate from Prometheus metrics:
 * hit_rate = hits / (hits + misses)
 * 
 * Example PromQL:
 * rate(tenant_cache_hits_total[5m]) / 
 * (rate(tenant_cache_hits_total[5m]) + rate(tenant_cache_misses_total[5m]))
 */

// ============================================================================
// PHASE 3: CUSTOM BUSINESS METRICS
// ============================================================================

/**
 * Product Operations
 * 
 * Track product lifecycle events for business analytics.
 * Labels: tenant_id (for per-customer debugging), category_slug
 */
export const productCreations = new Counter({
    name: 'products_created_total',
    help: 'Total products created',
    labelNames: ['tenant_id', 'category_slug'],
    registers: [register]
});

export const productUpdates = new Counter({
    name: 'products_updated_total',
    help: 'Total products updated',
    labelNames: ['tenant_id'],
    registers: [register]
});

export const productDeletes = new Counter({
    name: 'products_deleted_total',
    help: 'Total products deleted',
    labelNames: ['tenant_id'],
    registers: [register]
});

/**
 * Checkout Performance & Success Rate
 * 
 * Critical business metric for revenue tracking.
 * Histogram: P50, P95, P99 checkout duration
 * Counter: Success/failure rate
 * 
 * Labels:
 * - tenant_id: Per-customer SLA tracking
 * - payment_method: Normalized to enum (cash/card/online) to prevent high cardinality
 * - status: success/failed
 */
export const checkoutDuration = new Histogram({
    name: 'checkout_duration_seconds',
    help: 'Time to complete checkout process',
    labelNames: ['tenant_id', 'payment_method', 'status'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],  // seconds
    registers: [register]
});

export const checkoutTotal = new Counter({
    name: 'checkout_total',
    help: 'Total checkout attempts',
    labelNames: ['tenant_id', 'payment_method', 'status'],
    registers: [register]
});

/**
 * Cache Effectiveness (L1/L2)
 * 
 * Track dual-layer cache performance for optimization.
 * Labels:
 * - cache_layer: L1 (domain→tenantId) or L2 (tenantId→tenant data)
 * - hit: true/false
 * - operation: get/set
 */
export const cacheHits = new Counter({
    name: 'cache_hits_total',
    help: 'Cache hit/miss tracking for L1 and L2',
    labelNames: ['cache_layer', 'hit', 'operation'],
    registers: [register]
});

export const cacheSize = new Counter({
    name: 'cache_size_items',
    help: 'Current number of items in cache',
    labelNames: ['cache_layer'],
    registers: [register]
});

/**
 * Redis Command Volume (Cost / Quota)
 *
 * Helps attribute Upstash/Redis command usage to specific components.
 * Labels:
 * - purpose: redis client purpose (cache, rate-limit, bullmq, etc.)
 * - command: Redis command name (get, set, eval, ...)
 */
export const redisCommandsTotal = new Counter({
    name: 'redis_commands_total',
    help: 'Total Redis commands issued by the app',
    labelNames: ['purpose', 'command'],
    registers: [register]
});

export const redisCommandErrorsTotal = new Counter({
    name: 'redis_command_errors_total',
    help: 'Total Redis client error events (connection / command failures)',
    labelNames: ['purpose'],
    registers: [register]
});

/**
 * Event Bus Health
 * 
 * Track event publishing success/failure for async operations.
 * Labels:
 * - event_name: menu.updated, order.created, etc.
 * - success: true/false
 */
export const eventBusPublished = new Counter({
    name: 'eventbus_published_total',
    help: 'Events published to queue',
    labelNames: ['event_name', 'success'],
    registers: [register]
});

export const eventBusDuration = new Histogram({
    name: 'eventbus_publish_duration_seconds',
    help: 'Time to publish event to queue',
    labelNames: ['event_name'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1],  // seconds
    registers: [register]
});

/**
 * Domain Verification (Cron)
 *
 * Tracks verification success/failure and current active domains count.
 * Labels:
 * - status: success|failure
 * - error_type: dns|timeout|unknown|none
 */
export const domainVerificationCounter = new Counter({
    name: 'domain_verification_total',
    help: 'Total domain verification attempts',
    labelNames: ['status', 'error_type'],
    registers: [register]
});

export const activeDomainsGauge = new Gauge({
    name: 'active_domains_count',
    help: 'Current number of verified (active) domains',
    registers: [register]
});

/**
 * Domain Verification Cron Health
 *
 * Tracks last successful run timestamp and total failures.
 */
export const domainVerificationLastRun = new Gauge({
    name: 'domain_verification_cron_last_run_timestamp',
    help: 'Unix timestamp of last successful cron run',
    registers: [register]
});

export const domainVerificationFailures = new Counter({
    name: 'domain_verification_cron_failures_total',
    help: 'Total number of cron job failures',
    registers: [register]
});

/**
 * Missing Offer (Phase 4 DoD)
 *
 * Count of (tenantId, branchId, variantId) pairs that are "visible in menu" (must-have)
 * but have no Offer. 0 = normal; >0 = alert (create Offers or fix catalog).
 *
 * Must-have = CatalogItem.status ACTIVE + ItemVariant.isDefault + isAvailable + category
 * visible at branch via CategoryBranch. Updated by periodic job (e.g. every 5 min).
 */
export const missingOffer = new Gauge({
    name: 'missing_offer',
    help: 'Count of must-have (branch,variant) pairs without an Offer; 0=normal, >0=alert',
    registers: [register]
});

/**
 * Unix timestamp (seconds) of last successful missing_offer job run.
 * Used in alert to avoid false positives from stale replicas (job stuck/failing):
 * alert only when missing_offer > 0 AND (time() - missing_offer_last_success_timestamp_seconds) < 600.
 */
export const missingOfferLastSuccessTimestamp = new Gauge({
    name: 'missing_offer_last_success_timestamp_seconds',
    help: 'Unix timestamp of last successful missing_offer metric update; for alert freshness',
    registers: [register]
});

/**
 * Payments Webhooks (V2 Payment Core)
 *
 * Operational counters for "2xx but ignored/no-op", signature failures, and dedup.
 *
 * Labels are intentionally low-cardinality:
 * - provider: mollie|monobank|liqpay|unknown
 * - outcome: fixed enum (see webhooks.routes.ts)
 */
export const paymentsWebhookRequestsTotal = new Counter({
    name: 'payments_webhook_requests_total',
    help: 'Total payment webhook ingress requests and outcomes',
    labelNames: ['provider', 'outcome'],
    registers: [register]
});

/**
 * Payments External Resync (UNMATCHED give-up)
 *
 * If UNMATCHED retries are exhausted, we stop auto-processing and require manual intervention.
 */
export const paymentsUnmatchedGiveUpTotal = new Counter({
    name: 'payments_unmatched_give_up_total',
    help: 'Total UNMATCHED give-ups in resync.external (requires manual intervention)',
    labelNames: ['provider_type'],
    registers: [register]
});

/**
 * Payments Event Status Transitions
 *
 * Tracks lifecycle transitions for PaymentEvent rows (RECEIVED → UNMATCHED → PROCESSED/FAILED).
 * Labels are low-cardinality enums.
 */
export const paymentsEventStatusTransitionsTotal = new Counter({
    name: 'payments_event_status_transitions_total',
    help: 'Total PaymentEvent status transitions',
    labelNames: ['status_from', 'status_to'],
    registers: [register]
});

/**
 * Payments Webhook Processing Outcomes
 *
 * Tracks processing results in the webhook.process worker/job.
 */
export const paymentsWebhookProcessTotal = new Counter({
    name: 'payments_webhook_process_total',
    help: 'Total webhook.process results',
    labelNames: ['result'],
    registers: [register]
});

/**
 * Payments UNMATCHED Attempts
 *
 * Counts attempts to resolve UNMATCHED events via resync.external (with DB backoff).
 */
export const paymentsUnmatchedAttemptsTotal = new Counter({
    name: 'payments_unmatched_attempts_total',
    help: 'Total attempts to resolve UNMATCHED events in resync.external',
    labelNames: ['provider_type', 'code', 'transient'],
    registers: [register]
});

/**
 * Payments Sweeper (V2 Payment Core)
 *
 * Tracks how many jobs are enqueued by sweepers and how many items were due at the time of the tick.
 */
export const paymentsSweeperEnqueuedTotal = new Counter({
    name: 'payments_sweeper_enqueued_total',
    help: 'Total jobs enqueued by the payments sweeper',
    labelNames: ['job'],
    registers: [register]
});

export const paymentsSweeperDueGauge = new Gauge({
    name: 'payments_sweeper_due',
    help: 'Number of due rows found in the last sweeper run, by kind',
    labelNames: ['kind'],
    registers: [register]
});

/**
 * Payments Sweeper Last Success Timestamp
 *
 * Unix timestamp (seconds) of the last successful payments sweeper tick.
 * Use in alerts to detect when sweepers are not running (worker down, stuck, or disabled).
 */
export const paymentsSweeperLastSuccessTimestamp = new Gauge({
    name: 'payments_sweeper_last_success_timestamp_seconds',
    help: 'Unix timestamp of last successful payments sweeper tick',
    registers: [register]
});

/**
 * Payments UNMATCHED Backlog Gauges
 *
 * Operational signals for "gray zone" webhook processing:
 * - backlog: total UNMATCHED rows (regardless of nextAttemptAt)
 * - manual_attention: UNMATCHED rows where auto-retry is paused (unmatchedNextAttemptAt is null)
 * - oldest_age_seconds: age of the oldest UNMATCHED row (seconds)
 *
 * Labels are intentionally low-cardinality.
 */
export const paymentsUnmatchedBacklogGauge = new Gauge({
    name: 'payments_unmatched_backlog',
    help: 'Current number of UNMATCHED PaymentEvent rows',
    registers: [register]
});

export const paymentsUnmatchedManualAttentionGauge = new Gauge({
    name: 'payments_unmatched_manual_attention',
    help: 'Current number of UNMATCHED PaymentEvent rows that require manual intervention (unmatchedNextAttemptAt is null)',
    registers: [register]
});

export const paymentsUnmatchedOldestAgeSecondsGauge = new Gauge({
    name: 'payments_unmatched_oldest_age_seconds',
    help: 'Age in seconds of the oldest UNMATCHED PaymentEvent row (0 if none)',
    registers: [register]
});

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Normalize Payment Method to Prevent High Cardinality
 * 
 * CRITICAL: Never pass user input directly as metric label!
 * This function ensures we only have 3 possible values instead of thousands.
 * 
 * High cardinality problem:
 * - User input: "monobank", "privat24", "card 4111...", "my-custom-method"
 * - Result: Thousands of unique time series → Prometheus OOM
 * 
 * Solution: Normalize to fixed enum
 * - cash
 * - card (includes monobank, privat, card numbers, etc.)
 * - online (LiqPay, PayPal, etc.)
 * 
 * @param method - Raw payment method from request (user input)
 * @returns Normalized value: 'cash' | 'card' | 'online'
 */
export function normalizePaymentMethod(method?: string): string {
    if (!method) return 'cash';

    const lower = method.toLowerCase().trim();

    // Card payments (Monobank, Privat24, card numbers, etc.)
    if (lower.includes('card') ||
        lower.includes('mono') ||
        lower.includes('privat') ||
        /^\d{16}/.test(method)) {  // Starts with 16 digits (card number)
        return 'card';
    }

    // Online payments (LiqPay, PayPal, Stripe, etc.)
    if (lower.includes('online') ||
        lower.includes('liqpay') ||
        lower.includes('paypal') ||
        lower.includes('stripe')) {
        return 'online';
    }

    // Default: cash (COD - Cash on Delivery)
    return 'cash';
}
