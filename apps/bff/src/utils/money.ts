/**
 * Centralized Money Architecture
 * 
 * Rules:
 * 1. DB always stores integers (cents).
 * 2. Business Logic always operates on integers (cents).
 * 3. Frontend/API Responses always receive floats (major units).
 * 
 * This file is the ONLY place where conversion happens.
 */

/**
 * Converts minor units (cents) to major units (e.g. UAH).
 * Usage: API Responses, BFF Read Layer.
 * @param cents Integer amount in cents
 * @returns Float amount (e.g. 10.50)
 */
export const moneyFromMinor = (cents: number): number => {
    // Safety check: if someone passes a float, we fix it, but ideally it should be an int.
    return Math.round(cents) / 100;
};

/**
 * Converts major units (e.g. UAH) to minor units (cents).
 * Usage: DB Writes, or calculations starting from external major-unit inputs.
 * @param units Float amount (e.g. 10.50)
 * @returns Integer amount in cents.
 * - Non-number (undefined, null, string) → throws TypeError (caller bug).
 * - Non-finite (NaN, Infinity) → 0 so DB never gets NaN.
 */
export const moneyToMinor = (units: number): number => {
    if (typeof units !== 'number') {
        throw new TypeError('moneyToMinor expects a number');
    }
    if (!Number.isFinite(units)) return 0;
    return Math.round(units * 100);
};

// Re-export for convenience if strict typing is needed later
export const Money = {
    fromMinor: moneyFromMinor,
    toMinor: moneyToMinor
};
