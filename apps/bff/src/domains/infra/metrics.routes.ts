/**
 * Metrics Endpoint
 * 
 * Exposes Prometheus metrics at GET /metrics
 * Format: Prometheus text-based exposition format
 * 
 * Metrics exported:
 * - tenant_cache_hits_total
 * - tenant_cache_misses_total
 * - tenant_resolution_duration_seconds
 * - tenant_mismatch_errors_total (security)
 * - http_request_duration_seconds
 */

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'crypto';
import { register } from '../../lib/metrics.js';

export async function metricsRoutes(app: FastifyInstance) {
    /**
     * GET /metrics
     * 
     * Returns Prometheus metrics in text format.
     * This endpoint should be scraped by Prometheus server.
     * 
     * Example response:
     * # HELP tenant_cache_hits_total Total number of tenant resolution cache hits
     * # TYPE tenant_cache_hits_total counter
     * tenant_cache_hits_total{tenant_id="123"} 42
     * 
     * Security: Protected by INTERNAL_API_SECRET (timing-safe comparison)
     * Rate limited: 60 requests per minute per IP
     */
    app.get('/metrics', {
        config: {
            rateLimit: {
                max: 60,
                timeWindow: '1 minute',
                keyGenerator: (req: FastifyRequest) => `metrics:${req.ip}`
            }
        }
    }, async (req, reply) => {
        // 🔒 Security: Allow Prometheus (localhost/Docker) without auth, require secret for external
        const secret = req.headers['x-internal-secret'] as string | undefined;
        const expectedSecret = process.env.INTERNAL_API_SECRET || '';
        const clientIp = req.ip;

        // Allow unauthenticated access from localhost/Docker (Prometheus)
        const isLocalhost = clientIp === '127.0.0.1' ||
            clientIp === '::1' ||
            clientIp === '::ffff:127.0.0.1' ||
            clientIp?.startsWith('172.') || // Docker bridge network
            clientIp?.startsWith('192.168.'); // Docker/local network

        if (isLocalhost) {
            // Prometheus scraping from localhost/Docker - allow without auth
            try {
                const metrics = await register.metrics();
                reply.header('Content-Type', register.contentType);
                return reply.send(metrics);
            } catch (err) {
                req.log.error(err);
                return reply.status(500).send({ error: 'Failed to generate metrics' });
            }
        }

        // External access requires authentication
        // Timing-safe comparison to prevent brute-force attacks
        const expectedBuffer = Buffer.from(expectedSecret, 'utf-8');
        const providedBuffer = Buffer.from(secret || '', 'utf-8');

        let authorized = false;

        // Prevent length-based timing leaks
        if (expectedBuffer.length === providedBuffer.length) {
            try {
                authorized = timingSafeEqual(expectedBuffer, providedBuffer);
            } catch (error) {
                authorized = false;
            }
        }

        if (!authorized) {
            req.log.warn({
                ip: req.ip,
                event: 'UNAUTHORIZED_METRICS_ACCESS',
                userAgent: req.headers['user-agent']
            }, 'Unauthorized metrics access attempt');

            return reply.code(403).send({
                error: 'Forbidden',
                message: 'x-internal-secret header required for external access'
            });
        }

        // Generate and return metrics
        try {
            const metrics = await register.metrics();
            reply.header('Content-Type', register.contentType);
            return reply.send(metrics);
        } catch (err) {
            req.log.error(err);
            return reply.status(500).send({ error: 'Failed to generate metrics' });
        }
    });
}
