/**
 * Domain Verification Service
 * Atomic workflow for verifying and activating custom domains
 */

import type { PrismaClient, CustomDomain } from '@vendora/database';
import {
    checkDNSTxtRecord,
    checkDNSCname,
    checkHttpVerification,
    generateHttpToken
} from '@vendora/tenant-resolver/dns';
import { cacheManager } from './cache-manager.js';

// DomainStatus enum values (from Prisma schema)
const DomainStatus = {
    PENDING: 'PENDING' as const,
    VERIFIED: 'VERIFIED' as const,
    FAILED: 'FAILED' as const
};

export interface VerificationResult {
    success: boolean;
    error?: string;
    domain?: CustomDomain;
}

/**
 * Verify DNS configuration and activate domain
 *
 * IMPORTANT: Provider.addDomain() is called during domain creation (POST /domains),
 * NOT during verification. This function only checks DNS configuration.
 *
 * All CustomDomain access is tenant-scoped. Call only with the tenantId of the
 * tenant that owns the domain.
 *
 * @param prisma - Prisma client
 * @param tenantId - Tenant that owns the domain (required for tenant-scoped access)
 * @param domainId - Domain ID to verify
 * @returns Verification result with success/error
 */
export async function verifyAndActivate(
    prisma: PrismaClient,
    tenantId: string,
    domainId: string
): Promise<VerificationResult> {

    try {
        return await prisma.$transaction(async (tx) => {
            // Step 1: Lock row for update (tenant-scoped lookup)
            const domain = await tx.customDomain.findFirst({
                where: { id: domainId, tenantId }
            });

            if (!domain) {
                return { success: false, error: 'Domain not found' };
            }

            if (domain.status === DomainStatus.VERIFIED) {
                // Already verified - idempotent
                return { success: true, domain };
            }

            // Step 2: DNS Verification (TXT record - ownership proof)
            const txtCheck = await checkDNSTxtRecord(domain.domain, domain.txtRecord);

            if (!txtCheck.verified) {
                return {
                    success: false,
                    error: `TXT verification failed: ${txtCheck.reason}`
                };
            }

            // Step 3: CNAME or HTTP verification (infrastructure check)
            const cnameTarget = domain.cnameTarget ||
                (domain.provider === 'vercel' ? 'cname.vercel-dns.com' : 'custom');

            let cnameOk = false;
            let httpOk = false;

            const cnameCheck = await checkDNSCname(domain.domain, cnameTarget);

            if (cnameCheck.verified) {
                cnameOk = true;
            } else {
                // Fallback: HTTP verification (for Cloudflare proxy domains)
                const httpToken = generateHttpToken(domain.tenantId, domain.domain);
                const httpCheck = await checkHttpVerification(domain.domain, httpToken);

                if (httpCheck.verified) {
                    httpOk = true;
                } else {
                    return {
                        success: false,
                        error: `Verification failed. CNAME: ${cnameCheck.reason}, HTTP: ${httpCheck.reason}`
                    };
                }
            }

            // Step 4: Tenant-scoped update (updateMany + count-check; no @@unique([id, tenantId]) on CustomDomain)
            const updateRes = await tx.customDomain.updateMany({
                where: {
                    id: domainId,
                    tenantId,
                    status: domain.status // Optimistic lock - prevents concurrent updates
                },
                data: {
                    status: DomainStatus.VERIFIED,
                    verifiedAt: new Date(),
                    lastVerifiedAt: new Date(),
                    verifiedBy: 'auto',
                    cnameValid: cnameOk,
                    httpVerified: httpOk,
                    failureCount: 0,
                    lastFailureAt: null
                }
            });

            if (updateRes.count !== 1) {
                return { success: false, error: 'Domain was modified, retry' };
            }

            const updatedDomain = await tx.customDomain.findFirst({
                where: { id: domainId, tenantId }
            });

            if (!updatedDomain) {
                return { success: false, error: 'Domain not found' };
            }

            // 🔥 CRITICAL: Cache invalidation
            cacheManager.invalidateTenant(domain.tenantId);

            return { success: true, domain: updatedDomain };
        });
    } catch (err: unknown) {
        console.error('verifyAndActivate error:', err);
        return {
            success: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            error: (err as any).message || 'Verification failed due to unexpected error'
        };
    }
}
