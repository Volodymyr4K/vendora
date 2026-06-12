/**
 * Health Check Endpoint
 * 
 * Provides uptime and database connectivity status for monitoring.
 * 
 * Features:
 * - No authentication required (public endpoint)
 * - Checks database connection via lightweight query
 * - Returns service uptime
 * - Standard format for load balancers and monitoring tools
 */

import type { FastifyInstance } from 'fastify';
import { prisma } from '@vendora/database';

export async function healthRoutes(app: FastifyInstance) {
    /**
     * GET /health
     * 
     * Health check endpoint for monitoring and load balancers.
     * 
     * Response Codes:
     * - 200: Service healthy, all checks passed
     * - 503: Service unavailable, database connection failed
     * 
 * Example Response (200 OK):
 * {
 *   "status": "ok",
 *   "timestamp": "2026-01-10T18:15:00.000Z",
 *   "uptime": 123.45,
 *   "service": "vendora-bff",
 *   "checks": {
 *     "database": "ok"
 *   }
 * }
     */
    app.get('/health', {
        config: {
            rateLimit: false // Health checks should not be rate limited
        }
    }, async (req, reply) => {
        const timestamp = new Date().toISOString();
        const uptime = process.uptime();

        // Check database connection
        let databaseStatus = 'ok';
        let error: string | undefined;

        try {
            // Lightweight query to verify database connectivity
            await prisma.$queryRaw`SELECT 1`;
        } catch (e) {
            databaseStatus = 'error';
            error = e instanceof Error ? e.message : 'Database connection failed';

            // Log error but don't expose details to client
            // Fastify runtime-decorated logger
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const reqLog = (req as any).log;
            if (reqLog) {
                reqLog.error({
                    error: e instanceof Error ? { message: e.message, stack: e.stack } : String(e)
                }, 'Health check: Database connection failed');
            }

            return reply.code(503).send({
                status: 'error',
                timestamp,
                uptime,
                service: 'vendora-bff',
                checks: {
                    database: databaseStatus
                },
                error
            });
        }

        // All checks passed
        return reply.code(200).send({
            status: 'ok',
            timestamp,
            uptime,
            service: 'vendora-bff',
            checks: {
                database: databaseStatus
            }
        });
    });
}
