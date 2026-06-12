import punycode from 'punycode.js';

/**
 * Normalize domain name to lowercase ASCII (punycode)
 * Edge-compatible - uses punycode.js instead of Node built-in
 * 
 * @example
 * normalizeDomain("Example.COM") → "example.com"
 * normalizeDomain("bücher.com") → "xn--bcher-kva.com"
 */
export function normalizeDomain(rawDomain: string): string {
    // Step 1: Trim and lowercase
    let domain = rawDomain.trim().toLowerCase();

    // Step 2: Remove port if present
    domain = domain.split(':')[0];

    // Step 3: Remove trailing dot (if any)
    if (domain.endsWith('.')) {
        domain = domain.slice(0, -1);
    }

    // Step 4: Convert IDN to punycode (Edge-safe)
    // Example: "bücher.com" → "xn--bcher-kva.com"
    try {
        domain = punycode.toASCII(domain);
    } catch (err) {
        throw new Error('Invalid domain encoding');
    }

    return domain;
}

/**
 * Convert punycode domain back to Unicode for display
 * Edge-compatible
 * 
 * @example
 * toUnicodeDomain("xn--bcher-kva.com") → "bücher.com"
 */
export function toUnicodeDomain(punycoded: string): string {
    try {
        return punycode.toUnicode(punycoded);
    } catch (err) {
        return punycoded; // Return as-is if conversion fails
    }
}
