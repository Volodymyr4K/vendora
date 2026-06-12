/**
 * Request Logger Plugin
 * 
 * Adds request correlation IDs and structured logging to all requests.
 * 
 * Features:
 * - Unique requestId per request
 * - Request start/end logging with duration
 * - Attach logger to req object with auto-included requestId
 * - Log errors with full context
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { randomUUID } from 'crypto';
import { logger } from '../lib/logger.js';

export async function requestLoggerPlugin(app: FastifyInstance) {
    // Add requestId to every request
    app.addHook('onRequest', async (req: FastifyRequest, _reply: FastifyReply) => {
        // Generate unique correlation ID
        const requestId = randomUUID();
        const path = (req.url ?? "").split("?")[0] ?? "";

        // Attach to request for use in handlers
        // Fastify runtime-decorated properties
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).requestId = requestId;

        // Create child logger with requestId auto-included in all logs
        // Fastify runtime-decorated logger
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).log = logger.child({
            requestId,
            method: req.method,
            url: path
        });

        // Store start time for duration calculation
        // Fastify runtime-decorated property for metrics
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).startTime = Date.now();

        // Log request start
        // Fastify runtime-decorated logger
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (req as any).log.info({
            method: req.method,
            url: path,
            headers: {
                'user-agent': req.headers['user-agent'],
                'x-tenant-slug': req.headers['x-tenant-slug']
            }
        }, 'Request started');
    });

    // Log request completion
    app.addHook('onResponse', async (req: FastifyRequest, reply: FastifyReply) => {
        // Fastify runtime-decorated property
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const duration = Date.now() - ((req as any).startTime || 0);
        // Fastify runtime-decorated property
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reqLogger = (req as any).log || logger;

        reqLogger.info({
            method: req.method,
            url: (req.url ?? "").split("?")[0] ?? "",
            statusCode: reply.statusCode,
            duration,
            // Fastify runtime-decorated property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tenantId: (req as any).tenant?.id,
            // Fastify runtime-decorated property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userId: (req as any).user?.userId
        }, `Request completed in ${duration}ms`);
    });

    // Log errors with full context
    app.addHook('onError', async (req: FastifyRequest, reply: FastifyReply, error: Error) => {
        // Fastify runtime-decorated property
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const reqLogger = (req as any).log || logger;

        reqLogger.error({
            error: {
                message: error.message,
                stack: error.stack,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                code: (error as any).code
            },
            method: req.method,
            url: (req.url ?? "").split("?")[0] ?? "",
            // Fastify runtime-decorated property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            tenantId: (req as any).tenant?.id,
            // Fastify runtime-decorated property
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            userId: (req as any).user?.userId
        }, 'Request error');
    });
}
