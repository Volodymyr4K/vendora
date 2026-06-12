/**
 * Storefront Domain Types
 * 
 * Public-facing APIs for customers (menu, checkout, orders)
 */

import type { Cache } from "../../cache/index.js";
import type { Upstream } from "../../services/upstream.js";
import type { Metrics } from "../../observability/metrics.js";
import type { AppConfig } from "../../config.js";
import type { PrismaClient } from "@vendora/database";
import type { PaymentService } from "../../services/payment.js";
import type { EventBus } from "../../services/event-bus/bus.js";
import type { PubSubService } from "../../services/pubsub.js";

/**
 * Standard dependencies for Storefront routes
 * 
 * @property cache - Tiered cache (L1 + L2)
 * @property upstream - External API client with circuit breaker
 * @property prisma - Database client
 * @property paymentService - Payment gateway integration
 * @property ttlSec - Cache TTL (fresh data window)
 * @property staleSec - Stale window (serve-stale strategy)
 * @property swr - Enable Stale-While-Revalidate
 * @property metrics - Prometheus metrics (optional)
 * @property eventBus - Event publishing (optional)
 * @property pubsub - Distributed cache invalidation (optional)
 */
export type StorefrontDeps = {
    cache: Cache;
    upstream: Upstream;
    prisma: PrismaClient;
    paymentService: PaymentService;
    config: AppConfig;
    ttlSec: number;
    staleSec: number;
    swr: boolean;
    metrics?: Metrics;
    idemTtlSec: number;
    orderTtlSec: number;
    orderUpstream: boolean;
    quoteCache: { ttlSec: number; staleSec: number };
    eventBus?: EventBus;
    pubsub?: PubSubService;
};
