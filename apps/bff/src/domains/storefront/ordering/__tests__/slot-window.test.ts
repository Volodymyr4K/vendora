/**
 * Unit tests for computeSlotWindow function
 * 
 * Test coverage:
 * - Ensures start >= minTime (no early slots due to seconds/millis truncation)
 * - Correct rounding to 30-minute boundaries
 * - Edge cases with seconds and milliseconds
 */

import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { computeSlotWindow } from '../slot-window.js';

describe('computeSlotWindow', () => {
    describe('start >= minTime constraint (seconds/millis bug fix)', () => {
        it('should bump to next slot when minTime has seconds (case A)', () => {
            // now=2026-01-26T14:00:30.500Z, minAdvance=30
            // minTime=14:30:30.500 -> expected start=15:00:00.000Z
            const now = DateTime.fromISO('2026-01-26T14:00:30.500Z', { zone: 'UTC' });
            const minAdvanceMinutes = 30;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.toISO()).toBe('2026-01-26T15:00:00.000Z');
            expect(start >= minTime).toBe(true);
        });

        it('should bump to next slot when minTime has milliseconds only (case B)', () => {
            // now=2026-01-26T14:00:00.500Z, minAdvance=30
            // minTime=14:30:00.500 -> expected start=15:00:00.000Z
            const now = DateTime.fromISO('2026-01-26T14:00:00.500Z', { zone: 'UTC' });
            const minAdvanceMinutes = 30;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.toISO()).toBe('2026-01-26T15:00:00.000Z');
            expect(start >= minTime).toBe(true);
        });

        it('should bump to next slot when minTime has seconds at minute boundary (case C)', () => {
            // now=2026-01-26T14:29:45.000Z, minAdvance=1
            // minTime=14:30:45.000 -> expected start=15:00:00.000Z
            const now = DateTime.fromISO('2026-01-26T14:29:45.000Z', { zone: 'UTC' });
            const minAdvanceMinutes = 1;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.toISO()).toBe('2026-01-26T15:00:00.000Z');
            expect(start >= minTime).toBe(true);
        });

        it('should not bump when minTime is exactly on boundary (case D)', () => {
            // now=2026-01-26T14:00:00.000Z, minAdvance=30
            // minTime=14:30:00.000 -> expected start=14:30:00.000Z
            const now = DateTime.fromISO('2026-01-26T14:00:00.000Z', { zone: 'UTC' });
            const minAdvanceMinutes = 30;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.toISO()).toBe('2026-01-26T14:30:00.000Z');
            expect(start >= minTime).toBe(true);
            expect(start.equals(minTime)).toBe(true);
        });
    });

    describe('general rounding behavior', () => {
        it('should round up to next 30-minute boundary when minute is 15', () => {
            const now = DateTime.fromISO('2026-01-26T14:15:00.000Z', { zone: 'UTC' });
            const minAdvanceMinutes = 0;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.minute).toBe(30);
            expect(start.hour).toBe(14);
            expect(start >= minTime).toBe(true);
        });

        it('should round up to next hour when minute is 31', () => {
            const now = DateTime.fromISO('2026-01-26T14:31:00.000Z', { zone: 'UTC' });
            const minAdvanceMinutes = 0;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.minute).toBe(0);
            expect(start.hour).toBe(15);
            expect(start >= minTime).toBe(true);
        });

        it('should round up to next hour when minute is 45', () => {
            const now = DateTime.fromISO('2026-01-26T14:45:00.000Z', { zone: 'UTC' });
            const minAdvanceMinutes = 0;
            const { start } = computeSlotWindow(now, minAdvanceMinutes);
            const minTime = now.plus({ minutes: minAdvanceMinutes });

            expect(start.minute).toBe(0);
            expect(start.hour).toBe(15);
            expect(start >= minTime).toBe(true);
        });
    });

    describe('end boundary', () => {
        it('should set end to end of tomorrow', () => {
            const now = DateTime.fromISO('2026-01-26T14:00:00.000Z', { zone: 'UTC' });
            const { end } = computeSlotWindow(now, 30);

            expect(end.toISO()).toBe('2026-01-27T23:59:59.999Z');
        });
    });

    describe('start >= minTime invariant (all cases)', () => {
        it('should always satisfy start >= minTime for various now values', () => {
            const testCases = [
                { now: '2026-01-26T14:00:00.000Z', minAdvance: 30 },
                { now: '2026-01-26T14:00:30.000Z', minAdvance: 30 },
                { now: '2026-01-26T14:00:00.500Z', minAdvance: 30 },
                { now: '2026-01-26T14:00:30.500Z', minAdvance: 30 },
                { now: '2026-01-26T14:15:00.000Z', minAdvance: 15 },
                { now: '2026-01-26T14:29:45.000Z', minAdvance: 1 },
                { now: '2026-01-26T14:59:30.000Z', minAdvance: 1 },
            ];

            for (const testCase of testCases) {
                const now = DateTime.fromISO(testCase.now, { zone: 'UTC' });
                const { start } = computeSlotWindow(now, testCase.minAdvance);
                const minTime = now.plus({ minutes: testCase.minAdvance });

                expect(start >= minTime).toBe(true);
            }
        });
    });
});
