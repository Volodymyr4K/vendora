/**
 * Country and Currency Helper Functions
 * Centralized mapping for country codes, flags, and currency symbols
 */

/**
 * Get flag emoji for a given country code
 * @param code - ISO country code (e.g., "UA", "DE", "PL", "US")
 * @returns Flag emoji or globe emoji as fallback
 */
export function getCountryFlag(code: string | undefined | null): string {
    if (!code) return '🌍';
    const flags: Record<string, string> = {
        UA: '🇺🇦',
        DE: '🇩🇪',
        PL: '🇵🇱',
        US: '🇺🇸',
    };
    return flags[code.toUpperCase()] || '🌍';
}

/**
 * Get full country name for a given country code
 * @param code - ISO country code (e.g., "UA", "DE", "PL", "US")
 * @returns Country name or the code itself as fallback
 */
export function getCountryLabel(code: string | undefined | null): string {
    if (!code) return '';
    const labels: Record<string, string> = {
        UA: 'Ukraine',
        DE: 'Germany',
        PL: 'Poland',
        US: 'USA',
    };
    return labels[code.toUpperCase()] || code;
}

/**
 * Get currency symbol for a given currency code
 * @param currency - Currency code (e.g., "UAH", "EUR", "PLN", "USD")
 * @returns Currency symbol or empty string as fallback
 */
export function getCurrencySymbol(currency: string | undefined | null): string {
    if (!currency) return '';
    const symbols: Record<string, string> = {
        UAH: '₴',
        EUR: '€',
        PLN: 'zł',
        USD: '$',
    };
    return symbols[currency.toUpperCase()] || '';
}

/**
 * Get full currency label with symbol
 * @param currency - Currency code (e.g., "UAH", "EUR", "PLN", "USD")
 * @returns Formatted currency label (e.g., "₴ UAH")
 */
export function getCurrencyLabel(currency: string | undefined | null): string {
    if (!currency) return '';
    const symbol = getCurrencySymbol(currency);
    return symbol ? `${symbol} ${currency.toUpperCase()}` : currency.toUpperCase();
}
