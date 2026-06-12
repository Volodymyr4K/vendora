import { describe, it, expect, beforeEach, vi } from 'vitest';
import { verifyDomainDNS, verifyDomainHTTP, verifyDomain } from '../dns-lookup.js';
import dns from 'dns/promises';

// Mock dns module
vi.mock('dns/promises');

describe('DNS Lookup Service', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('verifyDomainDNS', () => {
        it('should verify domain with correct TXT and CNAME records', async () => {
            // Mock TXT record
            vi.mocked(dns.resolveTxt).mockResolvedValue([
                ['vendora-verify=test-token-123']
            ]);

            // Mock CNAME record
            vi.mocked(dns.resolveCname).mockResolvedValue([
                'cname.vendora-platform.com'
            ]);

            const result = await verifyDomainDNS(
                'example.com',
                'vendora-verify=test-token-123',
                'cname.vendora-platform.com'
            );

            expect(result.verified).toBe(true);
            expect(result.txtRecord).toBe(true);
            expect(result.cnameRecord).toBe(true);
            expect(result.error).toBeUndefined();
        });

        it('should fail verification when TXT record is missing', async () => {
            vi.mocked(dns.resolveTxt).mockResolvedValue([
                ['some-other-txt-record']
            ]);

            const result = await verifyDomainDNS(
                'example.com',
                'vendora-verify=test-token-123'
            );

            expect(result.verified).toBe(false);
            expect(result.txtRecord).toBe(false);
            expect(result.error).toContain('TXT record not found');
        });

        it('should fail verification when CNAME points to wrong target', async () => {
            vi.mocked(dns.resolveTxt).mockResolvedValue([
                ['vendora-verify=test-token-123']
            ]);

            vi.mocked(dns.resolveCname).mockResolvedValue([
                'wrong-target.com'
            ]);

            const result = await verifyDomainDNS(
                'example.com',
                'vendora-verify=test-token-123',
                'cname.vendora-platform.com'
            );

            expect(result.verified).toBe(false);
            expect(result.cnameRecord).toBe(false);
            expect(result.error).toContain('CNAME not pointing to');
        });

        it('should accept A record for apex domains when CNAME fails', async () => {
            vi.mocked(dns.resolveTxt).mockResolvedValue([
                ['vendora-verify=test-token-123']
            ]);

            // CNAME fails with ENODATA (typical for apex domains)
            vi.mocked(dns.resolveCname).mockRejectedValue({
                code: 'ENODATA'
            });

            // A record exists
            vi.mocked(dns.resolve4).mockResolvedValue([
                '123.45.67.89'
            ]);

            const result = await verifyDomainDNS(
                'example.com',
                'vendora-verify=test-token-123'
            );

            expect(result.verified).toBe(true);
            expect(result.cnameRecord).toBe(true); // A record counts as valid
        });

        it('should handle DNS lookup errors gracefully', async () => {
            vi.mocked(dns.resolveTxt).mockRejectedValue(
                new Error('DNS server unreachable')
            );

            const result = await verifyDomainDNS(
                'example.com',
                'vendora-verify=test-token-123'
            );

            expect(result.verified).toBe(false);
            expect(result.error).toContain('TXT lookup failed');
        });
    });

    describe('verifyDomainHTTP', () => {
        it('should verify domain via HTTP endpoint', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200
            });

            const result = await verifyDomainHTTP(
                'example.com',
                'test-token-123'
            );

            expect(result).toBe(true);
            expect(fetch).toHaveBeenCalledWith(
                'https://example.com/.well-known/vendora-verification/test-token-123',
                expect.objectContaining({
                    method: 'GET',
                    headers: {
                        'User-Agent': 'Vendora-Domain-Verifier/1.0'
                    }
                })
            );
        });

        it('should fail when HTTP endpoint returns error', async () => {
            global.fetch = vi.fn().mockResolvedValue({
                ok: false,
                status: 404
            });

            const result = await verifyDomainHTTP(
                'example.com',
                'test-token-123'
            );

            expect(result).toBe(false);
        });

        it('should fail when HTTP request times out', async () => {
            global.fetch = vi.fn().mockRejectedValue(
                new Error('Timeout')
            );

            const result = await verifyDomainHTTP(
                'example.com',
                'test-token-123'
            );

            expect(result).toBe(false);
        });
    });

    describe('verifyDomain (combined)', () => {
        it('should try DNS first, then HTTP fallback', async () => {
            // DNS fails
            vi.mocked(dns.resolveTxt).mockRejectedValue(
                new Error('DNS failed')
            );

            // HTTP succeeds
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                status: 200
            });

            const result = await verifyDomain(
                'example.com',
                'vendora-verify=test-token-123'
            );

            expect(result.verified).toBe(true);
            expect(fetch).toHaveBeenCalled(); // HTTP was tried
        });

        it('should not try HTTP if DNS succeeds', async () => {
            vi.mocked(dns.resolveTxt).mockResolvedValue([
                ['vendora-verify=test-token-123']
            ]);

            vi.mocked(dns.resolveCname).mockResolvedValue([
                'cname.vendora-platform.com'
            ]);

            global.fetch = vi.fn();

            const result = await verifyDomain(
                'example.com',
                'vendora-verify=test-token-123'
            );

            expect(result.verified).toBe(true);
            expect(fetch).not.toHaveBeenCalled(); // HTTP not needed
        });

        it('should return DNS error when both DNS and HTTP fail', async () => {
            vi.mocked(dns.resolveTxt).mockResolvedValue([
                ['wrong-txt']
            ]);

            global.fetch = vi.fn().mockRejectedValue(
                new Error('HTTP failed')
            );

            const result = await verifyDomain(
                'example.com',
                'vendora-verify=test-token-123'
            );

            expect(result.verified).toBe(false);
            expect(result.error).toBeDefined();
        });
    });
});
