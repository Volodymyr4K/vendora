import dns from 'dns/promises';
import { logger } from '../lib/logger.js';

/**
 * Wildcard Domain Support
 * Handles verification for *.example.com domains
 */

export interface WildcardVerificationResult {
    verified: boolean;
    txtRecord?: boolean;
    parentDomain?: string;
    error?: string;
}

/**
 * Verify wildcard domain (*.example.com)
 * Checks TXT record on parent domain
 */
export async function verifyWildcardDomain(
    domain: string,
    expectedTxtValue: string
): Promise<WildcardVerificationResult> {
    try {
        // Extract parent domain from *.example.com
        if (!domain.startsWith('*.')) {
            return {
                verified: false,
                error: 'Not a wildcard domain'
            };
        }

        const parentDomain = domain.replace('*.', '');

        logger.info(`[WILDCARD] Verifying ${domain} via parent ${parentDomain}`);

        // Check TXT record on parent domain
        let txtRecords: string[][] = [];
        try {
            txtRecords = await dns.resolveTxt(parentDomain);
        } catch (err: unknown) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((err as any).code === 'ENODATA' || (err as any).code === 'ENOTFOUND') {
                return {
                    verified: false,
                    parentDomain,
                    txtRecord: false,
                    error: 'TXT record not found on parent domain'
                };
            }
            throw err;
        }

        // Flatten TXT records and check for match
        const flatRecords = txtRecords.flat();
        const txtValid = flatRecords.some(record => record.includes(expectedTxtValue));

        if (!txtValid) {
            return {
                verified: false,
                parentDomain,
                txtRecord: false,
                error: `TXT record found but value mismatch. Expected: ${expectedTxtValue}`
            };
        }

        logger.info(`[WILDCARD] ✅ Verified ${domain}`);

        return {
            verified: true,
            parentDomain,
            txtRecord: true
        };

    } catch (error: unknown) {
        logger.error({ error, domain }, `[WILDCARD] Error verifying domain`);
        return {
            verified: false,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            error: (error as any).message || 'Unknown error'
        };
    }
}

/**
 * Check if domain is wildcard
 */
export function isWildcardDomain(domain: string): boolean {
    return domain.startsWith('*.');
}

/**
 * Get parent domain from wildcard
 */
export function getParentDomain(wildcardDomain: string): string {
    return wildcardDomain.replace('*.', '');
}
