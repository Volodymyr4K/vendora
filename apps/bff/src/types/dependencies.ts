import type { PrismaClient } from '@vendora/database';
import type { AppConfig } from '../config.js';
import type { Cache } from '../cache/index.js';
import type { PubSubService } from '../services/pubsub.js';
import type { EventBus } from '../services/event-bus/bus.js';
import type { Upstream } from '../services/upstream.js';
import type { PaymentService } from '../services/payment.js';
import type { Metrics } from '../observability/metrics.js';

/**
 * Standard dependency injection interface for all route handlers
 * Ensures type safety across domain boundaries
 * 
 * @example
 * ```typescript
 * export async function routesAdmin(
 *   app: FastifyInstance,
 *   deps: RoutesDependencies
 * ) {
 *   // deps.prisma is fully typed
 *   await deps.prisma.product.findMany({ ... });
 * }
 * ```
 */
export interface RoutesDependencies {
    // Core dependencies (always available)
    prisma: PrismaClient;
    cache: Cache;
    config: AppConfig;
    ttlSec: number;
    staleSec: number;
    swr: boolean;

    // Optional services (may not be available in all environments)
    pubsub?: PubSubService;
    eventBus?: EventBus;
    upstream?: Upstream;
    paymentService?: PaymentService;
    metrics?: Metrics;

    // Quote-specific cache config
    quoteCache?: {
        ttlSec: number;
        staleSec: number;
    };

    // Feature flags
    idemTtlSec?: number;
    orderTtlSec?: number;
    orderUpstream?: boolean;
}

/**
 * Minimum dependencies for auth routes
 * Auth routes don't need full upstream/payment services
 */
export interface AuthDependencies {
    prisma: PrismaClient;
    config: AppConfig;
    cache?: Cache;
}
