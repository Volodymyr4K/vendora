import dns from 'dns/promises';
import { logger } from '../lib/logger.js';

export interface DNSVerificationResult {
    verified: boolean;
    txtRecord: boolean;
    cnameRecord: boolean;
    error?: string;
}

/**
 * Verify DNS records for custom domain
 * 
 * Checks:
 * 1. TXT record contains verification token
 * 2. CNAME points to platform target (or A record for apex domains)
 */
export async function verifyDomainDNS(
    domain: string,
    expectedTxtValue: string,
    expectedCnameTarget: string = 'cname.vendora-platform.com'
): Promise<DNSVerificationResult> {
    const result: DNSVerificationResult = {
        verified: false,
        txtRecord: false,
        cnameRecord: false
    };

    try {
        // 1. Check TXT record
        try {
            const txtRecords = await dns.resolveTxt(domain);
            const flatTxtRecords = txtRecords.flat();

            result.txtRecord = flatTxtRecords.some(record =>
                record.includes(expectedTxtValue)
            );

            if (!result.txtRecord) {
                result.error = `TXT record not found. Expected: ${expectedTxtValue}`;
                return result;
            }
            // Error handling bypass
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } catch (err: any) {
            result.error = `TXT lookup failed: ${err.code || err.message}`;
            return result;
        }

        // 2. Check CNAME record
        try {
            const cnameRecords = await dns.resolveCname(domain);
            result.cnameRecord = cnameRecords.some(record =>
                record.toLowerCase() === expectedCnameTarget.toLowerCase()
            );

            if (!result.cnameRecord) {
                result.error = `CNAME not pointing to ${expectedCnameTarget}`;
                return result;
            }
        } catch (err: unknown) {
            // For apex domains, CNAME might not exist - check A record instead
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            if ((err as any).code === 'ENODATA' || (err as any).code === 'ENOTFOUND') {
                try {
                    const aRecords = await dns.resolve4(domain);
                    // Accept if A record exists (platform handles IP routing)
                    result.cnameRecord = aRecords.length > 0;

                    if (!result.cnameRecord) {
                        result.error = 'No CNAME or A record found';
                        return result;
                    }
                } catch {
                    result.error = 'CNAME/A record lookup failed';
                    return result;
                }
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                result.error = `CNAME lookup failed: ${(err as any).code || (err as any).message}`;
                return result;
            }
        }

        // Both checks passed
        result.verified = true;
        return result;

    } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        result.error = `DNS verification failed: ${(error as any).message}`;
        return result;
    }
}

/**
 * HTTP-based verification (fallback for Cloudflare proxied domains)
 * Uses the /.well-known/vendora-verification/[token] endpoint from Phase 5
 */
export async function verifyDomainHTTP(
    domain: string,
    verificationToken: string
): Promise<boolean> {
    // Manual AbortController for better error handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
        controller.abort();
    }, 5000);

    try {
        const response = await fetch(
            `https://${domain}/.well-known/vendora-verification/${verificationToken}`,
            {
                method: 'GET',
                headers: {
                    'User-Agent': 'Vendora-Domain-Verifier/1.0'
                },
                signal: controller.signal
            }
        );

        clearTimeout(timeoutId);
        // Endpoint returns 200 OK if token matches
        return response.ok;
    } catch (error: unknown) {
        clearTimeout(timeoutId);

        // Handle abort/timeout errors gracefully (prevents crash)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((error as any).name === 'AbortError' || (error as any).name === 'TimeoutError') {
            logger.warn(`[DNS-HTTP] Verification timeout for ${domain} (5s)`);
            return false;
        }

        // Handle network errors (domain not reachable)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((error as any).cause?.code === 'ENOTFOUND' || (error as any).cause?.code === 'ECONNREFUSED') {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            logger.debug({ code: (error as any).cause.code }, `[DNS-HTTP] Domain ${domain} not reachable`);
            return false;
        }

        // Log unexpected errors for debugging
        // Log unexpected errors for debugging
        // Log unexpected errors for debugging
        logger.error({
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            name: (error as any).name,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            message: (error as any).message,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            code: (error as any).cause?.code,
            domain
        }, `[DNS-HTTP] Unexpected error`);
        return false;
    }
}

/**
 * Combined verification: Try DNS first, fallback to HTTP
 * Supports wildcard domains (*.example.com)
 */
export async function verifyDomain(
    domain: string,
    txtToken: string,
    cnameTarget?: string,
    isWildcard?: boolean
): Promise<DNSVerificationResult> {
    // Handle wildcard domains (*.example.com)
    if (isWildcard && domain.startsWith('*.')) {
        logger.info(`[DNS-VERIFY] Wildcard domain detected: ${domain}`);

        const { verifyWildcardDomain } = await import('./wildcard-domains.js');
        const wildcardResult = await verifyWildcardDomain(domain, txtToken);

        return {
            verified: wildcardResult.verified,
            txtRecord: wildcardResult.txtRecord || false,
            cnameRecord: true, // Wildcards don't need CNAME check
            error: wildcardResult.error
        };
    }

    // Primary check: DNS verification (regular domains)
    const dnsResult = await verifyDomainDNS(domain, txtToken, cnameTarget);

    if (dnsResult.verified) {
        return dnsResult;
    }

    // Fallback: HTTP verification (for Cloudflare proxy)
    logger.info(`[DNS-VERIFY] DNS failed for ${domain}, trying HTTP fallback`);
    const httpVerified = await verifyDomainHTTP(domain, txtToken);

    if (httpVerified) {
        return {
            verified: true,
            txtRecord: true,
            cnameRecord: true,
            error: undefined
        };
    }

    // Both failed, return DNS error
    return dnsResult;
}
