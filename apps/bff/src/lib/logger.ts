/**
 * Structured Logger with Pino
 * 
 * Production-grade JSON logging for debugging and observability.
 * 
 * Features:
 * - Development: Pretty-printed colorized logs
 * - Production: Machine-readable JSON logs
 * - Automatic request correlation (requestId)
 * - Searchable structured fields
 * 
 * Usage:
 * import { logger } from './lib/logger.js';
 * 
 * logger.info({ userId: '123', action: 'login' }, 'User logged in');
 * logger.warn({ tenantId: '456', event: 'quota_exceeded' }, 'Tenant quota exceeded');
 * logger.error({ error, requestId }, 'Request failed');
 */

import pino from 'pino';

const isDevelopment = process.env.NODE_ENV === 'development';
const logLevel = process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info');

export const logger = pino({
    level: logLevel,

    // Development: Pretty-printed with colors
    // Production: JSON for log aggregation (ELK, Datadog, etc.)
    transport: isDevelopment ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            translateTime: 'HH:MM:ss.l',
            ignore: 'pid,hostname',
            singleLine: false,
            messageFormat: '{if req.method}{req.method} {req.url}{end} {msg}'
        }
    } : undefined,

    // Base fields included in every log
    base: {
        service: 'bff',
        env: process.env.NODE_ENV || 'development'
    },

    // Format timestamps
    timestamp: pino.stdTimeFunctions.isoTime,

    // Redact sensitive fields (passwords, tokens, etc.)
    redact: {
        paths: [
            'req.headers.authorization',
            'req.headers.cookie',
            'password',
            'token',
            'secret'
        ],
        censor: '[REDACTED]'
    }
});

/**
 * Create child logger with additional context
 * 
 * Example:
 * const reqLogger = logger.child({ requestId: '123', tenantId: '456' });
 * reqLogger.info('Processing request'); // Includes requestId and tenantId
 */
export function createRequestLogger(context: { requestId: string; tenantId?: string; userId?: string }) {
    return logger.child(context);
}
