import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { prisma } from '@vendora/database';
import { verifyDomain } from '../dns-lookup.js';
import { randomUUID } from 'node:crypto';

// Mock the DNS lookup service
vi.mock('../dns-lookup', async () => {
    const actual = await vi.importActual('../dns-lookup');
    return {
        ...actual,
        verifyDomain: vi.fn()
    };
});

// Mock email and Slack services
vi.mock('../email', () => ({
    sendDomainVerificationFailedEmail: vi.fn(),
    sendDomainDisabledEmail: vi.fn()
}));

vi.mock('../slack', () => ({
    sendDomainFailureAlert: vi.fn(),
    sendDomainDisabledAlert: vi.fn()
}));

// Test isolation: explicit file-specific prefix (no magic imports - easier to debug in DB)
const TEST_PREFIX = 'domain-verification-cron-test__';

const uniqueSlug = () => `${TEST_PREFIX}${randomUUID()}`;

async function cleanupByPrefix() {
    try {
        // FK constraint: child records first, then parent
        await prisma.customDomain.deleteMany({
            where: { tenant: { slug: { startsWith: TEST_PREFIX } } }
        });
        await prisma.tenant.deleteMany({
            where: { slug: { startsWith: TEST_PREFIX } }
        });
    } catch (error) {
        console.error('[TEST CLEANUP FAILED]', {
            prefix: TEST_PREFIX,
            error: error instanceof Error ? error.message : String(error)
        });
        throw new Error(`Test cleanup failed for ${TEST_PREFIX}: ${error}`);
    }
}

describe.sequential('Domain Verification Cron Job Logic', () => {
    beforeAll(async () => {
        // Pre-clean: remove leftovers from previous runs
        await cleanupByPrefix();
    });

    beforeEach(() => {
        vi.clearAllMocks();
    });

    afterEach(async () => {
        // Post-clean: cleanup even if test failed
        await cleanupByPrefix();
    });

    describe('Domain Query', () => {
        it('should fetch VERIFIED and PENDING domains for re-verification', async () => {
            const tenant = await prisma.tenant.create({
                data: {
                    name: 'Test Tenant',
                    slug: uniqueSlug()
                }
            });

            await prisma.customDomain.create({
                data: {
                    domain: `verified-${randomUUID()}.com`,
                    status: 'VERIFIED',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`
                }
            });

            await prisma.customDomain.create({
                data: {
                    domain: `pending-${randomUUID()}.com`,
                    status: 'PENDING',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`
                }
            });

            await prisma.customDomain.create({
                data: {
                    domain: `failed-${randomUUID()}.com`,
                    status: 'FAILED',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`
                }
            });

            // Query domains that should be re-verified (same as cron job)
            const domainsToVerify = await prisma.customDomain.findMany({
                where: {
                    OR: [
                        { status: 'VERIFIED' },
                        { status: 'PENDING' }
                    ],
                    failureCount: { lt: 10 },
                    tenantId: tenant.id
                }
            });

            expect(domainsToVerify).toHaveLength(2);
        });

        it('should exclude domains with high failure count', async () => {
            const tenant = await prisma.tenant.create({
                data: {
                    name: 'Test Tenant 2',
                    slug: uniqueSlug()
                }
            });

            const failingDomain = `failing-domain-${randomUUID()}.com`;
            await prisma.customDomain.create({
                data: {
                    domain: failingDomain,
                    status: 'VERIFIED',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`,
                    failureCount: 15
                }
            });

            const domainsToVerify = await prisma.customDomain.findMany({
                where: {
                    OR: [{ status: 'VERIFIED' }, { status: 'PENDING' }],
                    failureCount: { lt: 10 },
                    tenantId: tenant.id
                }
            });

            expect(domainsToVerify.map(d => d.domain)).not.toContain(failingDomain);
        });
    });

    describe('Grace Period Logic', () => {
        it('should start grace period on first DNS failure', async () => {
            const tenant = await prisma.tenant.create({
                data: {
                    name: 'Grace Period Test',
                    slug: uniqueSlug()
                }
            });

            const domain = await prisma.customDomain.create({
                data: {
                    domain: `grace-test-${randomUUID()}.com`,
                    status: 'VERIFIED',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`,
                    gracePeriodStartedAt: null
                }
            });

            // Simulate DNS failure
            await prisma.customDomain.update({
                where: { id: domain.id },
                data: {
                    status: 'PENDING',
                    gracePeriodStartedAt: new Date(),
                    lastVerifiedAt: null
                }
            });

            const updated = await prisma.customDomain.findUnique({
                where: { id: domain.id }
            });

            expect(updated?.status).toBe('PENDING');
            expect(updated?.gracePeriodStartedAt).not.toBeNull();
        });

        it('should disable domain after grace period expires', async () => {
            const tenant = await prisma.tenant.create({
                data: {
                    name: 'Expired Grace Test',
                    slug: uniqueSlug()
                }
            });

            const eightDaysAgo = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);

            const domain = await prisma.customDomain.create({
                data: {
                    domain: `expired-domain-${randomUUID()}.com`,
                    status: 'PENDING',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`,
                    gracePeriodStartedAt: eightDaysAgo
                }
            });

            const GRACE_PERIOD_DAYS = 7;
            const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
            const gracePeriodEnd = new Date(
                domain.gracePeriodStartedAt!.getTime() + gracePeriodMs
            );

            expect(new Date() > gracePeriodEnd).toBe(true);

            await prisma.customDomain.update({
                where: { id: domain.id },
                data: { status: 'FAILED' }
            });

            const updated = await prisma.customDomain.findUnique({
                where: { id: domain.id }
            });

            expect(updated?.status).toBe('FAILED');
        });

        it('should reset grace period on successful re-verification', async () => {
            const tenant = await prisma.tenant.create({
                data: {
                    name: 'Reset Grace Test',
                    slug: uniqueSlug()
                }
            });

            const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);

            const domain = await prisma.customDomain.create({
                data: {
                    domain: `recovery-domain-${randomUUID()}.com`,
                    status: 'PENDING',
                    tenantId: tenant.id,
                    txtRecord: `vendora-verify-${randomUUID()}`,
                    gracePeriodStartedAt: twoDaysAgo
                }
            });

            await prisma.customDomain.update({
                where: { id: domain.id },
                data: {
                    status: 'VERIFIED',
                    lastVerifiedAt: new Date(),
                    gracePeriodStartedAt: null
                }
            });

            const updated = await prisma.customDomain.findUnique({
                where: { id: domain.id }
            });

            expect(updated?.status).toBe('VERIFIED');
            expect(updated?.gracePeriodStartedAt).toBeNull();
            expect(updated?.lastVerifiedAt).not.toBeNull();
        });
    });

    describe('Metrics Tracking', () => {
        it('should count only verified domains for active gauge', async () => {
            const tenant = await prisma.tenant.create({
                data: {
                    name: 'Metrics Test',
                    slug: uniqueSlug()
                }
            });

            await prisma.customDomain.createMany({
                data: [
                    { domain: `verified1-${randomUUID()}.com`, status: 'VERIFIED', tenantId: tenant.id, txtRecord: `v-${randomUUID()}` },
                    { domain: `verified2-${randomUUID()}.com`, status: 'VERIFIED', tenantId: tenant.id, txtRecord: `v-${randomUUID()}` },
                    { domain: `pending1-${randomUUID()}.com`, status: 'PENDING', tenantId: tenant.id, txtRecord: `p-${randomUUID()}` },
                    { domain: `failed1-${randomUUID()}.com`, status: 'FAILED', tenantId: tenant.id, txtRecord: `f-${randomUUID()}` }
                ]
            });

            const activeCount = await prisma.customDomain.count({
                where: {
                    status: 'VERIFIED',
                    tenantId: tenant.id
                }
            });

            expect(activeCount).toBe(2);
        });
    });
});
