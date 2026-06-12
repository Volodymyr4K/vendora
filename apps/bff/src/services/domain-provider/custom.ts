/**
 * Custom Domain Provider (No-op)
 * For self-hosted infrastructure without external provider
 */

import {
    DomainProvider,
    DomainProviderConfig,
    DomainProviderResult
} from './interface.js';

export class CustomDomainProvider implements DomainProvider {
    readonly name = 'custom';

    async addDomain(config: DomainProviderConfig): Promise<DomainProviderResult> {
        // Custom infrastructure - no API integration needed
        // User manually configures their infrastructure

        return {
            providerId: `custom-${config.domain}`,
            verified: false,
            requiredRecords: [] // User handles DNS manually
        };
    }

    async removeDomain(_providerDomainId: string): Promise<void> {
        // No-op for custom provider
        return;
    }
}
