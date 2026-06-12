import { prisma as _prisma } from '@vendora/database';
import type { FastifyRequest } from 'fastify';

/**
 * Audit log for compliance and security tracking
 * Tracks all domain-related actions for regulatory compliance
 */

export type AuditAction =
    | 'domain_added'
    | 'domain_verified'
    | 'domain_deleted'
    | 'domain_failed'
    | 'domain_verification_attempted'
    | 'domain_set_primary';

export interface AuditLogEntry {
    action: AuditAction;
    tenantId: string;
    userId?: string;
    domainId?: string;
    domain: string;
    // Validating arbitrary metadata object
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
}

/**
 * Log audit event for domain actions
 * Stored in database for compliance and security analysis
 */
export async function logAudit(entry: AuditLogEntry): Promise<void> {
    try {
        // For now, log to console (TODO: add AuditLog table to schema)
        const logEntry = {
            timestamp: new Date().toISOString(),
            action: entry.action,
            tenantId: entry.tenantId,
            userId: entry.userId || 'system',
            domain: entry.domain,
            domainId: entry.domainId,
            metadata: entry.metadata,
            ip: entry.ipAddress,
            userAgent: entry.userAgent
        };

        // eslint-disable-next-line no-console
        console.log('[AUDIT]', JSON.stringify(logEntry));

        // TODO: Uncomment when AuditLog table is added to schema
        /*
        await prisma.auditLog.create({
          data: {
            action: entry.action,
            tenantId: entry.tenantId,
            userId: entry.userId,
            resource: 'custom_domain',
            resourceId: entry.domainId || '',
            metadata: entry.metadata || {},
            ipAddress: entry.ipAddress,
            userAgent: entry.userAgent,
            timestamp: new Date()
          }
        });
        */
    } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[AUDIT] Failed to log audit event:', error);
        // Don't throw - audit logging failures shouldn't break the app
    }
}

/**
 * Helper to extract user context from request
 */
export function getUserContext(req: FastifyRequest): { userId?: string; ipAddress?: string; userAgent?: string } {
    return {
        userId: (req.user as { id?: string } | undefined)?.id,
        ipAddress: req.ip || (Array.isArray(req.headers['x-forwarded-for']) ? req.headers['x-forwarded-for'][0] : req.headers['x-forwarded-for']) || req.socket.remoteAddress,
        userAgent: Array.isArray(req.headers['user-agent']) ? req.headers['user-agent'][0] : req.headers['user-agent']
    };
}
