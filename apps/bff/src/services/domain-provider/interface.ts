/**
 * Domain Provider Interface
 * Strategy pattern for infrastructure-agnostic domain management
 */

export interface DNSRecord {
    type: 'A' | 'TXT' | 'CNAME';
    name: string;
    value: string;
    ttl?: number;
}

export interface DomainProviderResult {
    providerId: string;          // Domain ID from provider API
    verified: boolean;            // SSL ready/verified
    requiredRecords: DNSRecord[]; // DNS records user must configure
}

export interface DomainProviderConfig {
    domain: string;
    projectId?: string;
    gitBranch?: string | null;
}

export interface DomainProvider {
    readonly name: string; // 'vercel' | 'cloudflare' | 'custom'

    /**
     * Add domain to infrastructure provider
     * Called during domain creation (POST /domains)
     */
    addDomain(config: DomainProviderConfig): Promise<DomainProviderResult>;

    /**
     * Remove domain from infrastructure provider
     * Called during domain deletion
     */
    removeDomain(providerDomainId: string): Promise<void>;
}
