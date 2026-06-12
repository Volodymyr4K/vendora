/**
 * DNS verification functions (Node.js ONLY - not Edge-compatible)
 * Import via: import { ... } from '@vendora/tenant-resolver/dns'
 */

import { createHmac } from 'crypto';
import { promises as dns } from 'dns';

/**
 * Generate TXT record for domain ownership verification
 * Uses HMAC-SHA256 with secret
 */
export function generateTxtRecord(tenantId: string, domain: string): string {
    const secret = process.env.DOMAIN_VERIFICATION_SECRET;
    if (!secret) {
        throw new Error('DOMAIN_VERIFICATION_SECRET not configured');
    }

    const payload = `${tenantId}:${domain}`;
    return createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
        .substring(0, 32); // First 32 chars
}

/**
 * Generate HTTP verification token (for Cloudflare proxy fallback)
 */
export function generateHttpToken(tenantId: string, domain: string): string {
    const secret = process.env.DOMAIN_VERIFICATION_SECRET;
    if (!secret) {
        throw new Error('DOMAIN_VERIFICATION_SECRET not configured');
    }

    const payload = `http:${tenantId}:${domain}`;
    return createHmac('sha256', secret)
        .update(payload)
        .digest('hex')
        .substring(0, 32);
}

/**
 * Check DNS TXT record with timeout
 */
export async function checkDNSTxtRecord(
    domain: string,
    expectedValue: string
): Promise<{ verified: boolean; reason?: string }> {
    try {
        // Timeout after 5 seconds
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DNS timeout')), 5000)
        );

        const lookupPromise = dns.resolveTxt(domain);

        const records = await Promise.race([lookupPromise, timeoutPromise]);

        // TXT records are arrays of arrays: [['value1'], ['value2']]
        const flatRecords = records.flat();

        const verified = flatRecords.includes(expectedValue);

        return {
            verified,
            reason: verified ? undefined : 'TXT record not found or incorrect value'
        };
    } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        if (error.code === 'ENODATA' || error.code === 'ENOTFOUND') {
            return { verified: false, reason: 'No TXT records found (DNS not configured)' };
        }
        if (error.message === 'DNS timeout') {
            return { verified: false, reason: 'DNS query timeout (5s)' };
        }
        throw err;
    }
}

/**
 * Check DNS CNAME record
 */
export async function checkDNSCname(
    domain: string,
    expectedTarget: string
): Promise<{ verified: boolean; reason?: string }> {
    try {
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('DNS timeout')), 5000)
        );

        const lookupPromise = dns.resolveCname(domain);

        const records = await Promise.race([lookupPromise, timeoutPromise]);
        const verified = records.includes(expectedTarget);

        return {
            verified,
            reason: verified ? undefined : `CNAME does not point to ${expectedTarget}`
        };
    } catch (err: unknown) {
        const error = err as { code?: string; message?: string };
        if (error.code === 'ENODATA') {
            return { verified: false, reason: 'No CNAME record found' };
        }
        if (error.message === 'DNS timeout') {
            return { verified: false, reason: 'DNS query timeout (5s)' };
        }
        throw err;
    }
}

/**
 * Check HTTP verification endpoint (Cloudflare proxy fallback)
 */
export async function checkHttpVerification(
    domain: string,
    expectedToken: string
): Promise<{ verified: boolean; reason?: string }> {
    try {
        // Use native fetch (Node.js 18+)
        const response = await fetch(
            `https://${domain}/.well-known/vendora-verification/${expectedToken}`,
            { signal: AbortSignal.timeout(5000) }
        );

        if (!response.ok) {
            return { verified: false, reason: 'Verification endpoint not found (404)' };
        }

        const token = (await response.text()).trim();

        if (token === expectedToken) {
            return { verified: true };
        }

        return { verified: false, reason: 'Token mismatch' };
    } catch (err: unknown) {
        const error = err as { name?: string; message?: string };
        if (error.name === 'AbortError') {
            return { verified: false, reason: 'HTTP check timeout (5s)' };
        }
        return { verified: false, reason: `HTTP check failed: ${error.message}` };
    }
}
