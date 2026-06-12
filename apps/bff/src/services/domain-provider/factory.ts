/**
 * Domain Provider Factory
 * Creates appropriate provider based on configuration
 */

import { DomainProvider } from './interface.js';
import { VercelDomainProvider } from './vercel.js';
import { CloudflareDomainProvider } from './cloudflare.js';
import { CustomDomainProvider } from './custom.js';

export function createDomainProvider(
    providerName: string = 'vercel'
): DomainProvider {
    switch (providerName.toLowerCase()) {
        case 'vercel':
            return new VercelDomainProvider();

        case 'cloudflare':
            return new CloudflareDomainProvider();

        case 'custom':
            return new CustomDomainProvider();

        default:
            throw new Error(`Unknown provider: ${providerName}. Supported: vercel, cloudflare, custom`);
    }
}

// Re-export types for convenience
export * from './interface.js';
