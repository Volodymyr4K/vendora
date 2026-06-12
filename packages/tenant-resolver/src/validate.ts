/**
 * Validation result interface
 */
export interface ValidationResult {
    valid: boolean;
    error?: string;
    suggestion?: string;
}

/**
 * Validate custom domain (FQDN rules + security checks)
 * Edge-compatible - no Node.js dependencies
 */
export function validateCustomDomain(domain: string): ValidationResult {
    // Rule 1: Must be valid FQDN (no schema, no path)
    if (domain.includes('://') || domain.includes('/')) {
        return {
            valid: false,
            error: 'Domain must not include protocol or path'
        };
    }

    // Rule 2: Reject IP addresses
    const ipPattern = /^(\d{1,3}\.){3}\d{1,3}$/;
    if (ipPattern.test(domain)) {
        return {
            valid: false,
            error: 'IP addresses not allowed'
        };
    }

    // Rule 3: Reject localhost and internal zones
    const forbiddenPatterns = [
        'localhost',
        '.local',
        '.internal',
        '.test',
        '.example',
        '127.0.0.1',
        '0.0.0.0'
    ];

    if (forbiddenPatterns.some(pattern => domain.includes(pattern))) {
        return {
            valid: false,
            error: 'Internal/localhost domains not allowed'
        };
    }

    // Rule 4: Reject base domain (will be injected at runtime)
    // This check is done separately in the BFF with actual BASE_DOMAIN

    // Rule 5: Must have valid TLD
    const parts = domain.split('.');
    if (parts.length < 2 || parts[parts.length - 1].length < 2) {
        return {
            valid: false,
            error: 'Invalid domain format - must have valid TLD'
        };
    }

    // Rule 6: Reject www subdomain (enforce apex domain)
    if (domain.startsWith('www.')) {
        return {
            valid: false,
            error: 'Please use apex domain instead of www subdomain',
            suggestion: domain.replace('www.', '')
        };
    }

    // Rule 7: Basic domain format validation
    const domainRegex = /^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?(\.[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?)*$/;
    if (!domainRegex.test(domain)) {
        return {
            valid: false,
            error: 'Invalid domain format - use only letters, numbers, and hyphens'
        };
    }

    return { valid: true };
}

/**
 * Detect mixed-script domains (homograph attack protection)
 * Edge-compatible
 */
export interface MixedScriptResult {
    safe: boolean;
    warning?: string;
    scripts?: string[];
}

export function detectMixedScript(domain: string): MixedScriptResult {
    // Unicode blocks (simplified)
    const UNICODE_BLOCKS = {
        LATIN: /^[\x00-\x7F\u00C0-\u00FF\u0100-\u017F]+$/,
        CYRILLIC: /^[\u0400-\u04FF]+$/,
        GREEK: /^[\u0370-\u03FF]+$/,
        ARABIC: /^[\u0600-\u06FF]+$/,
        CJK: /^[\u4E00-\u9FFF\u3400-\u4DBF]+$/,
    };

    // Extract domain name without TLD
    const parts = domain.split('.');
    if (parts.length < 2) return { safe: true };

    const domainName = parts.slice(0, -1).join(''); // Remove TLD

    // Check if domain uses only ONE script
    const matchedScripts: string[] = [];

    for (const [scriptName, regex] of Object.entries(UNICODE_BLOCKS)) {
        if (regex.test(domainName)) {
            matchedScripts.push(scriptName);
        }
    }

    if (matchedScripts.length === 1) {
        return { safe: true, scripts: matchedScripts }; // Single script - safe
    }

    if (matchedScripts.length === 0) {
        // Mixed scripts detected (didn't match any single block)
        return {
            safe: false,
            warning: 'Domain contains mixed scripts (potential homograph attack)',
            scripts: []
        };
    }

    return { safe: true };
}
