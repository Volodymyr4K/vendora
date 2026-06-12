/**
 * Vercel Domain Provider
 * Integrates with Vercel Domains API for domain activation
 */

import {
    DomainProvider,
    DomainProviderConfig,
    DomainProviderResult,
    DNSRecord
} from './interface.js';
import { getErrorMessage } from '../../utils/error-helpers.js';

export class VercelDomainProvider implements DomainProvider {
    readonly name = 'vercel';

    private apiToken: string;
    private projectId: string;

    constructor() {
        this.apiToken = process.env.VERCEL_API_TOKEN || '';
        this.projectId = process.env.VERCEL_PROJECT_ID || '';

        if (!this.apiToken || !this.projectId) {
            console.warn('⚠️ Vercel API credentials not configured (VERCEL_API_TOKEN, VERCEL_PROJECT_ID)');
        }
    }

    async addDomain(config: DomainProviderConfig): Promise<DomainProviderResult> {
        if (!this.apiToken || !this.projectId) {
            throw new Error('Vercel API credentials not configured. Set VERCEL_API_TOKEN and VERCEL_PROJECT_ID.');
        }

        try {
            const response = await fetch(
                `https://api.vercel.com/v9/projects/${this.projectId}/domains`,
                {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`,
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        name: config.domain,
                        gitBranch: config.gitBranch ?? null
                    })
                }
            );

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Vercel API error: ${error.error?.message || response.statusText}`);
            }

            const data = await response.json();

            // Parse required DNS records from Vercel response
            const requiredRecords: DNSRecord[] = [];

            // A record for apex domains (Vercel's IP)
            requiredRecords.push({
                type: 'A',
                name: '@',
                value: '76.76.21.21',
                ttl: 3600
            });

            // TXT verification record (if not verified)
            if (data.verification && !data.verified) {
                requiredRecords.push({
                    type: 'TXT',
                    name: data.verification.domain || '_vercel',
                    value: data.verification.value,
                    ttl: 3600
                });
            }

            return {
                providerId: data.uid || data.name,
                verified: data.verified || false,
                requiredRecords
            };
        } catch (err: unknown) {
            console.error('Vercel addDomain failed:', err);
            throw new Error(`Failed to add domain to Vercel: ${getErrorMessage(err)}`);
        }
    }

    async removeDomain(providerDomainId: string): Promise<void> {
        if (!this.apiToken || !this.projectId) {
            console.warn('⚠️ Vercel API not configured, skipping domain removal');
            return;
        }

        try {
            const response = await fetch(
                `https://api.vercel.com/v9/projects/${this.projectId}/domains/${providerDomainId}`,
                {
                    method: 'DELETE',
                    headers: {
                        'Authorization': `Bearer ${this.apiToken}`
                    }
                }
            );

            if (!response.ok && response.status !== 404) {
                const error = await response.json();
                console.error('Vercel removeDomain failed:', error);
            }
        } catch (err) {
            console.error('Vercel removeDomain error:', err);
            // Non-critical, don't throw
        }
    }
}
