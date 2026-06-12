import client from "prom-client";
import {
  register,
  checkoutDuration,
  checkoutTotal,
  productCreations,
  productUpdates,
  productDeletes,
  normalizePaymentMethod,
  missingOffer,
  missingOfferLastSuccessTimestamp
} from "../lib/metrics.js";

export type Metrics = ReturnType<typeof createMetrics>;

export function createMetrics() {
  // Use singleton registry from lib/metrics to prevent split-brain
  client.collectDefaultMetrics({ register });

  const httpDuration = new client.Histogram({
    name: "bff_http_request_duration_seconds",
    help: "Fastify request duration",
    labelNames: ["method", "route", "status"] as const,
    buckets: [0.01, 0.03, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  const upstreamDuration = new client.Histogram({
    name: "bff_upstream_request_duration_seconds",
    help: "Upstream request duration",
    labelNames: ["op", "status"] as const,
    buckets: [0.02, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [register],
  });

  const cacheResult = new client.Counter({
    name: "bff_cache_result_total",
    help: "Cache result counter",
    labelNames: ["key", "result"] as const, // result: cache|upstream|stale|miss
    registers: [register],
  });

  const breakerState = new client.Gauge({
    name: "bff_circuit_breaker_state",
    help: "Circuit breaker state (0 closed, 1 open, 2 half_open)",
    labelNames: ["name"] as const,
    registers: [register],
  });

  // Outbox Metrics
  const outboxPending = new client.Gauge({
    name: "outbox_pending_count",
    help: "Number of events in PENDING state",
    registers: [register],
  });

  const outboxProcessing = new client.Gauge({
    name: "outbox_processing_count",
    help: "Number of events in PROCESSING state",
    registers: [register],
  });

  const outboxDead = new client.Gauge({
    name: "outbox_dead_count",
    help: "Number of events in DEAD state",
    registers: [register],
  });

  const outboxOldestAge = new client.Gauge({
    name: "outbox_oldest_pending_age_seconds",
    help: "Age in seconds of the oldest PENDING event",
    registers: [register],
  });

  return {
    registry: register,
    httpDuration,
    upstreamDuration,
    cacheResult,
    breakerState,
    // Business Metrics Injection
    checkoutDuration,
    checkoutTotal,
    productCreations,
    productUpdates,
    productDeletes,
    // Outbox
    outboxPending,
    outboxProcessing,
    outboxDead,
    outboxOldestAge,
    // Utils
    normalizePaymentMethod,
    // Phase 4 DoD: missing_offer (0=normal, >0=alert) + last success ts (alert freshness)
    missingOffer,
    missingOfferLastSuccessTimestamp
  };
}

export function encodeBreakerState(state: "closed" | "open" | "half_open"): number {
  if (state === "open") return 1;
  if (state === "half_open") return 2;
  return 0;
}
