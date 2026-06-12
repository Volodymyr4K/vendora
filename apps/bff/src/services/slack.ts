import { IncomingWebhook } from '@slack/webhook';
import { logger } from '../lib/logger.js';

const webhook = process.env.SLACK_WEBHOOK_URL
    ? new IncomingWebhook(process.env.SLACK_WEBHOOK_URL)
    : null;

export async function sendSlackAlert(
    message: string,
    level: 'info' | 'warning' | 'error' = 'info'
) {
    if (!webhook) {
        logger.debug('Slack webhook not configured');
        return;
    }

    const emoji = {
        info: ':information_source:',
        warning: ':warning:',
        error: ':rotating_light:',
    };

    try {
        await webhook.send({
            text: `${emoji[level]} ${message}`,
        });
    } catch (error) {
        logger.error({ error }, 'Failed to send Slack alert');
    }
}

export async function sendDomainFailureAlert(
    domain: string,
    tenantName: string,
    reason: string
) {
    await sendSlackAlert(
        `🌐 Domain *${domain}* (${tenantName}) verification failed: ${reason}`,
        'warning'
    );
}

export async function sendDomainDisabledAlert(
    domain: string,
    tenantName: string
) {
    await sendSlackAlert(
        `🔴 Domain *${domain}* (${tenantName}) disabled after grace period`,
        'error'
    );
}

/**
 * Send critical alert for cron job failures
 * Used when domain verification cron fails after retries
 */
export async function sendCronFailureAlert(error: Error): Promise<void> {
    if (!webhook) {
        logger.warn('[SLACK] Webhook not configured, cannot send cron failure alert');
        return;
    }

    try {
        await webhook.send({
            text: ':rotating_light: *Domain Verification Cron Failed*',
            attachments: [{
                color: '#f44336',
                title: '🚨 Critical: Cron Job Failure',
                text: `The domain verification cron job has failed after 3 retry attempts.\n\n*Error:* ${error.message}\n\n*Action Required:* Check BFF logs and Redis connectivity.`,
                fields: [
                    {
                        title: 'Error Message',
                        value: error.message,
                        short: false
                    },
                    {
                        title: 'Stack Trace',
                        value: error.stack?.split('\n').slice(0, 3).join('\n') || 'N/A',
                        short: false
                    },
                    {
                        title: 'Timestamp',
                        value: new Date().toISOString(),
                        short: true
                    }
                ],
                footer: 'Vendora Platform',
                ts: String(Math.floor(Date.now() / 1000))
            }]
        });
    } catch (sendError) {
        logger.error({ error: sendError }, '[SLACK] Failed to send cron failure alert');
    }
}

/**
 * Send warning for cache warming failures
 * Used when Redis pipeline fails during cache warming
 */
export async function sendCacheWarmingAlert(
    domainsTotal: number,
    domainsFailed: number,
    error: string
): Promise<void> {
    if (!webhook) {
        logger.warn('[SLACK] Webhook not configured, cannot send cache warming alert');
        return;
    }

    try {
        await webhook.send({
            text: ':warning: *Cache Warming Pipeline Failed*',
            attachments: [{
                color: '#ff9800',
                title: '⚠️ Cache Warming Degraded',
                text: `Redis pipeline warming failed, used sequential fallback.`,
                fields: [
                    {
                        title: 'Total Domains',
                        value: String(domainsTotal),
                        short: true
                    },
                    {
                        title: 'Failed Domains',
                        value: String(domainsFailed),
                        short: true
                    },
                    {
                        title: 'Error',
                        value: error,
                        short: false
                    }
                ],
                footer: 'Vendora Platform',
                ts: String(Math.floor(Date.now() / 1000))
            }]
        });
    } catch (sendError) {
        logger.error({ error: sendError }, '[SLACK] Failed to send cache warming alert');
    }
}
