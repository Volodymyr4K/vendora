/**
 * Cloudflare Domain Provider (Stub)
 * TODO: Implement Cloudflare Pages/Workers/DNS integration
 */

import {
    DomainProvider,
    DomainProviderConfig,
    DomainProviderResult
} from './interface.js';

export class CloudflareDomainProvider implements DomainProvider {
    readonly name = 'cloudflare';

    async addDomain(_config: DomainProviderConfig): Promise<DomainProviderResult> {
        // TODO: Implement Cloudflare API integration
        // Options:
        // 1. Cloudflare Pages: POST /accounts/:accountId/pages/projects/:projectName/domains
        // 2. Cloudflare Workers: Custom routing via _routes.json
        // 3. Cloudflare DNS: Add CNAME record via API

        throw new Error('Cloudflare provider not yet implemented');
    }

    async removeDomain(_providerDomainId: string): Promise<void> {
        // TODO: Implement Cloudflare removal
        throw new Error('Cloudflare provider not yet implemented');
    }
}
