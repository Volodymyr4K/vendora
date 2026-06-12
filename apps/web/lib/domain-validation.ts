/**
 * Client-side domain validation
 * Mirrors backend validation rules
 */

export interface ValidationResult {
    valid: boolean;
    error?: string;
    suggestion?: string;
}

export function validateCustomDomain(domain: string): ValidationResult {
    if (!domain) {
        return { valid: false, error: 'Domain is required' };
    }

    // Remove protocol if present
    if (domain.includes('://')) {
        return { valid: false, error: 'Remove protocol (http:// or https://)' };
    }

    // Remove path if present
    if (domain.includes('/')) {
        return { valid: false, error: 'Domain must not include path' };
    }

    // Check for www subdomain
    if (domain.startsWith('www.')) {
        return {
            valid: false,
            error: 'Use apex domain instead of www subdomain',
            suggestion: domain.replace('www.', '')
        };
    }

    // Check for localhost/internal
    const forbiddenPatterns = ['localhost', '.local', '.internal', '.test', '.example'];
    if (forbiddenPatterns.some(pattern => domain.includes(pattern))) {
        return { valid: false, error: 'Internal/localhost domains not allowed' };
    }

    // Basic format validation
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
    if (!domainRegex.test(domain)) {
        return { valid: false, error: 'Invalid domain format - use only letters, numbers, and hyphens' };
    }

    // Check for valid TLD
    const parts = domain.split('.');
    const tld = parts[parts.length - 1];
    if (parts.length < 2 || !tld || tld.length < 2) {
        return { valid: false, error: 'Domain must have valid TLD (e.g., .com, .ua)' };
    }

    return { valid: true };
}
