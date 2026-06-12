import { describe, it, expect } from 'vitest';
import { moneyToMinor, moneyFromMinor, Money } from '../money.js';

describe('Money Utilities', () => {
    describe('moneyToMinor', () => {
        it('should convert major units to cents (10.50 → 1050)', () => {
            expect(moneyToMinor(10.50)).toBe(1050);
        });

        it('should handle whole numbers (10 → 1000)', () => {
            expect(moneyToMinor(10)).toBe(1000);
        });

        it('should handle zero (0 → 0)', () => {
            expect(moneyToMinor(0)).toBe(0);
        });

        it('should handle negative values (-10.50 → -1050)', () => {
            expect(moneyToMinor(-10.50)).toBe(-1050);
        });

        it('should round floating point errors (10.005 → 1001)', () => {
            // JavaScript floating point: 10.005 * 100 = 1000.4999999999999
            // Math.round should fix it to 1001
            expect(moneyToMinor(10.005)).toBe(1001);
        });

        it('should handle very small amounts (0.01 → 1)', () => {
            expect(moneyToMinor(0.01)).toBe(1);
        });

        it('should handle large amounts (1000000.99 → 100000099)', () => {
            expect(moneyToMinor(1000000.99)).toBe(100000099);
        });

        it('should round half cents up (10.555 → 1056)', () => {
            // 10.555 * 100 = 1055.5 → rounds to 1056
            expect(moneyToMinor(10.555)).toBe(1056);
        });

        it('should return 0 for NaN (so DB never gets NaN)', () => {
            expect(moneyToMinor(Number.NaN)).toBe(0);
        });

        it('should return 0 for Infinity / -Infinity (so DB never gets non-integer)', () => {
            expect(moneyToMinor(Number.POSITIVE_INFINITY)).toBe(0);
            expect(moneyToMinor(Number.NEGATIVE_INFINITY)).toBe(0);
        });

        it('should throw TypeError for non-number (undefined, null, string) so caller bug surfaces', () => {
            expect(() => moneyToMinor(undefined as unknown as number)).toThrow(TypeError);
            expect(() => moneyToMinor(null as unknown as number)).toThrow(TypeError);
            expect(() => moneyToMinor('10' as unknown as number)).toThrow(TypeError);
        });
    });

    describe('moneyFromMinor', () => {
        it('should convert cents to major units (1050 → 10.50)', () => {
            expect(moneyFromMinor(1050)).toBe(10.50);
        });

        it('should handle whole numbers (1000 → 10.00)', () => {
            expect(moneyFromMinor(1000)).toBe(10.00);
        });

        it('should handle zero (0 → 0.00)', () => {
            expect(moneyFromMinor(0)).toBe(0.00);
        });

        it('should handle negative values (-1050 → -10.50)', () => {
            expect(moneyFromMinor(-1050)).toBe(-10.50);
        });

        it('should handle single cent (1 → 0.01)', () => {
            expect(moneyFromMinor(1)).toBe(0.01);
        });

        it('should handle large amounts (100000099 → 1000000.99)', () => {
            expect(moneyFromMinor(100000099)).toBe(1000000.99);
        });

        it('should fix float inputs defensively (1050.7 → 10.51)', () => {
            // If someone passes a float (bad practice), Math.round fixes it
            expect(moneyFromMinor(1050.7)).toBe(10.51);
        });

        it('should handle odd cents (1051 → 10.51)', () => {
            expect(moneyFromMinor(1051)).toBe(10.51);
        });
    });

    describe('Round-trip conversion', () => {
        it('should maintain precision in round-trip: toMinor → fromMinor', () => {
            const original = 123.45;
            const cents = moneyToMinor(original);
            const backToMajor = moneyFromMinor(cents);

            expect(backToMajor).toBe(original);
        });

        it('should maintain precision for edge case: 0.01', () => {
            const original = 0.01;
            const cents = moneyToMinor(original);
            const backToMajor = moneyFromMinor(cents);

            expect(backToMajor).toBe(original);
        });

        it('should maintain precision for large amounts', () => {
            const original = 999999.99;
            const cents = moneyToMinor(original);
            const backToMajor = moneyFromMinor(cents);

            expect(backToMajor).toBe(original);
        });

        it('should lose sub-cent precision as expected (10.555 → 10.56)', () => {
            // This is expected behavior: we can't store sub-cent values
            const original = 10.555;
            const cents = moneyToMinor(original); // 1056 (rounded)
            const backToMajor = moneyFromMinor(cents); // 10.56

            expect(backToMajor).toBe(10.56);
            expect(backToMajor).not.toBe(original);
        });
    });

    describe('Money namespace', () => {
        it('should provide toMinor via Money.toMinor', () => {
            expect(Money.toMinor(10.50)).toBe(1050);
        });

        it('should provide fromMinor via Money.fromMinor', () => {
            expect(Money.fromMinor(1050)).toBe(10.50);
        });
    });
});
