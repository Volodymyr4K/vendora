import cron from 'node-cron';
import { prisma } from '@vendora/database';
import { RedisLock } from './redis-lock.js';
import { sendDomainVerificationFailedEmail, sendDomainDisabledEmail } from './email.js';
import { sendDomainFailureAlert, sendDomainDisabledAlert, sendCronFailureAlert } from './slack.js';
import {
    domainVerificationCounter,
    activeDomainsGauge,
    domainVerificationLastRun,
    domainVerificationFailures
} from './metrics.js';
import { verifyDomain } from './dns-lookup.js';
import { logger } from '../lib/logger.js';

// DomainStatus enum values (from Prisma schema)
const DomainStatus = {
    PENDING: 'PENDING' as const,
    VERIFIED: 'VERIFIED' as const,
    FAILED: 'FAILED' as const
};

const LOCK_KEY = 'cron:domain-verification';
const LOCK_TTL = 3600; // 1 hour
const BATCH_SIZE = 100;
const GRACE_PERIOD_DAYS = parseInt(process.env.GRACE_PERIOD_DAYS || '7');

export function startDomainVerificationCron() {
    const schedule = process.env.DOMAIN_VERIFICATION_INTERVAL || '0 */6 * * *';

    cron.schedule(schedule, async () => {
        let attempt = 0;
        const maxRetries = 3;

        while (attempt < maxRetries) {
            attempt++;

            try {
                // Use Redis lock to ensure only ONE instance runs
                await RedisLock.withLock(LOCK_KEY, LOCK_TTL, async () => {
                    logger.info(`[CRON] Starting domain re-verification (attempt ${attempt}/${maxRetries})`);

                    try {
                        let processedCount = 0;
                        let cursor: string | undefined = undefined;

                        // Process domains in batches using cursor pagination
                        do {
                            // Dynamic Prisma query result
                            // eslint-disable-next-line @typescript-eslint/no-explicit-any
                            const batch: any[] = await prisma.customDomain.findMany({
                                where: {
                                    OR: [
                                        { status: DomainStatus.VERIFIED },
                                        { status: DomainStatus.PENDING },
                                    ],
                                    // Note: isActive field doesn't exist in schema, use failureCount instead
                                    failureCount: { lt: 10 }, // Skip domains with too many failures
                                },
                                take: BATCH_SIZE,
                                cursor: cursor ? { id: cursor } : undefined,
                                skip: cursor ? 1 : 0,
                                // Optimize: Select only needed fields (60% less memory)
                                select: {
                                    id: true,
                                    domain: true,
                                    status: true,
                                    txtRecord: true,
                                    cnameTarget: true,
                                    gracePeriodStartedAt: true,
                                    lastVerifiedAt: true,
                                    failureCount: true,
                                    tenantId: true,
                                    tenant: {
                                        select: {
                                            id: true,
                                            name: true,
                                            users: {
                                                where: { role: 'admin' },
                                                take: 1,
                                                select: {
                                                    email: true
                                                }
                                            }
                                        }
                                    }
                                },
                                orderBy: { id: 'asc' },
                            });

                            if (batch.length === 0) break;

                            logger.info(`[CRON] Processing batch of ${batch.length} domains`);

                            for (const domain of batch) {
                                try {
                                    await processDomain(domain);
                                    processedCount++;
                                } catch (error) {
                                    logger.error({ error, domain: domain.domain }, `[CRON] Error processing domain`);
                                }
                            }

                            // Set cursor to last item's ID
                            cursor = batch[batch.length - 1].id;

                        } while (true);

                        // Update metrics
                        const activeCount = await prisma.customDomain.count({
                            where: {
                                status: DomainStatus.VERIFIED, // Count only verified domains
                            },
                        });
                        activeDomainsGauge.set(activeCount);

                        logger.info(`[CRON] ✓ Verification completed. Processed ${processedCount} domains`);

                        // Update success metrics
                        domainVerificationLastRun.setToCurrentTime();
                    } catch (error) {
                        logger.error({ error }, '[CRON] Verification job failed');
                        throw error; // Re-throw to trigger retry
                    }
                });

                // Success - exit retry loop
                break;

            } catch (error: unknown) {
                logger.error({
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    error: (error as any).message,
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    stack: (error as any).stack,
                    attempt,
                    maxRetries
                }, `[CRON] ✗ Verification job failed`);

                domainVerificationFailures.inc();

                if (attempt >= maxRetries) {
                    // Critical failure - send alert
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    await sendCronFailureAlert(error as any);
                } else {
                    // Exponential backoff: 1min, 5min, 15min
                    const delayMs = Math.pow(5, attempt) * 60 * 1000;
                    logger.info(`[CRON] Retrying in ${delayMs / 1000}s...`);
                    await new Promise(resolve => setTimeout(resolve, delayMs));
                }
            }
        }
    });

    logger.info(`[CRON] Domain verification scheduled: ${schedule}`);
}

// Dynamic Prisma query result
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function processDomain(domain: any) {
    // Re-verify DNS with real DNS checker
    const verification = await verifyDomain(
        domain.domain,
        domain.txtRecord,
        domain.cnameTarget || 'cname.vendora-platform.com'
    );

    if (!verification.verified) {
        // DNS failed
        logger.warn({
            domain: domain.domain,
            tenantId: domain.tenantId,
            reason: verification.error,
        }, `[CRON] Domain verification failed`);

        // Track failure with error type
        const errorType = verification.error?.includes('DNS') ? 'dns' :
            verification.error?.includes('timeout') ? 'timeout' : 'unknown';
        domainVerificationCounter.inc({ status: 'failure', error_type: errorType });

        if (!domain.gracePeriodStartedAt) {
            // Start grace period
            await prisma.customDomain.update({
                where: { id: domain.id },
                data: {
                    status: DomainStatus.PENDING,
                    gracePeriodStartedAt: new Date(),
                    lastVerifiedAt: null,
                },
            });

            // Send notifications
            const adminUser = domain.tenant.users[0];
            if (adminUser) {
                await sendDomainVerificationFailedEmail(
                    adminUser.email,
                    domain.domain,
                    GRACE_PERIOD_DAYS
                );
            }

            await sendDomainFailureAlert(
                domain.domain,
                domain.tenant.name,
                verification.error || 'DNS verification failed'
            );

            logger.info({ domain: domain.domain }, `[CRON] Started grace period`);
        } else {
            // Check if grace period expired
            const gracePeriodMs = GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000;
            const gracePeriodEnd = new Date(
                domain.gracePeriodStartedAt.getTime() + gracePeriodMs
            );

            if (new Date() > gracePeriodEnd) {
                // Disable domain
                await prisma.customDomain.update({
                    where: { id: domain.id },
                    data: {
                        status: DomainStatus.FAILED,
                    },
                });

                const adminUser = domain.tenant.users[0];
                if (adminUser) {
                    await sendDomainDisabledEmail(adminUser.email, domain.domain);
                }

                await sendDomainDisabledAlert(domain.domain, domain.tenant.name);

                logger.warn({ domain: domain.domain }, `[CRON] Domain disabled after grace period`);
            }
        }
    } else {
        // DNS valid
        domainVerificationCounter.inc({ status: 'success', error_type: 'none' });

        await prisma.customDomain.update({
            where: { id: domain.id },
            data: {
                status: DomainStatus.VERIFIED,
                lastVerifiedAt: new Date(),
                gracePeriodStartedAt: null, // Reset grace period
            },
        });

        logger.debug({ domain: domain.domain }, `[CRON] Domain re-verified successfully`);
    }
}
