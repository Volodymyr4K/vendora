import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, BreakerOpenError, type BreakerState } from '../breaker.js';

describe('CircuitBreaker', () => {
    describe('State: CLOSED (Normal Operation)', () => {
        it('should start in CLOSED state', () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            expect(breaker.getState()).toBe('closed');
        });

        it('should pass through successful requests in CLOSED state', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockResolvedValue('success');

            const result = await breaker.exec(mockFn);

            expect(result).toBe('success');
            expect(mockFn).toHaveBeenCalledTimes(1);
            expect(breaker.getState()).toBe('closed');
        });

        it('should count consecutive failures in CLOSED state', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockRejectedValue(new Error('API failure'));

            // First failure
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');
            expect(breaker.getState()).toBe('closed');

            // Second failure
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');
            expect(breaker.getState()).toBe('closed');
        });

        it('should transition to OPEN after threshold failures', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockRejectedValue(new Error('API failure'));

            // Trigger 3 failures
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');

            // Should now be OPEN
            expect(breaker.getState()).toBe('open');
        });

        it('should reset failure count on success', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            const failFn = vi.fn().mockRejectedValue(new Error('Fail'));
            const successFn = vi.fn().mockResolvedValue('Success');

            // 2 failures
            await expect(breaker.exec(failFn)).rejects.toThrow();
            await expect(breaker.exec(failFn)).rejects.toThrow();

            // Then success - should reset counter
            await breaker.exec(successFn);

            // 2 more failures won't trigger OPEN (counter was reset)
            await expect(breaker.exec(failFn)).rejects.toThrow();
            await expect(breaker.exec(failFn)).rejects.toThrow();
            expect(breaker.getState()).toBe('closed');

            // One more failure should trigger OPEN
            await expect(breaker.exec(failFn)).rejects.toThrow();
            expect(breaker.getState()).toBe('open');
        });
    });

    describe('State: OPEN (Short-Circuit)', () => {
        it('should reject requests immediately in OPEN state', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 2,
                openMs: 5000,
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockRejectedValue(new Error('API failure'));

            // Trigger OPEN state
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');
            await expect(breaker.exec(mockFn)).rejects.toThrow('API failure');

            expect(breaker.getState()).toBe('open');

            // Next request should be rejected immediately without calling mockFn
            const callCount = mockFn.mock.calls.length;
            await expect(breaker.exec(mockFn)).rejects.toThrow(BreakerOpenError);

            // mockFn should NOT have been called again
            expect(mockFn).toHaveBeenCalledTimes(callCount);
        });

        it('should throw BreakerOpenError with breaker name in OPEN state', async () => {
            const breaker = new CircuitBreaker({
                name: 'my-api-breaker',
                enabled: true,
                failureThreshold: 1,
                openMs: 5000,
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

            // Trigger OPEN
            await expect(breaker.exec(mockFn)).rejects.toThrow();

            // Should throw BreakerOpenError
            await expect(breaker.exec(mockFn)).rejects.toThrow(
                expect.objectContaining({
                    code: 'BREAKER_OPEN',
                    message: expect.stringContaining('my-api-breaker')
                })
            );
        });

        it('should transition to HALF_OPEN after timeout', async () => {
            vi.useFakeTimers();

            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 1,
                openMs: 3000, // 3 seconds
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockRejectedValue(new Error('Fail'));

            // Trigger OPEN
            await expect(breaker.exec(mockFn)).rejects.toThrow();
            expect(breaker.getState()).toBe('open');

            // Advance time by 2 seconds (not enough)
            vi.advanceTimersByTime(2000);
            await expect(breaker.exec(mockFn)).rejects.toThrow(BreakerOpenError);
            expect(breaker.getState()).toBe('open');

            // Advance time by another 1.5 seconds (total 3.5s - enough)
            vi.advanceTimersByTime(1500);

            // Next request should transition to HALF_OPEN
            const successFn = vi.fn().mockResolvedValue('success');
            await breaker.exec(successFn);

            expect(breaker.getState()).toBe('closed'); // Success closes it

            vi.useRealTimers();
        });
    });

    describe('State: HALF_OPEN (Probing)', () => {
        it('should allow limited probes in HALF_OPEN state', async () => {
            vi.useFakeTimers();

            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 1,
                openMs: 1000,
                halfOpenMax: 1 // Allow only 1 concurrent probe
            });

            const failFn = vi.fn().mockRejectedValue(new Error('Fail'));

            // Trigger OPEN
            await expect(breaker.exec(failFn)).rejects.toThrow();

            // Wait for timeout
            vi.advanceTimersByTime(1100);

            // Create a slow promise that we can control
            let resolveSlowCall: () => void;
            const slowPromise = new Promise<string>(resolve => {
                resolveSlowCall = () => resolve('slow-success');
            });
            const slowFn = vi.fn(() => slowPromise);

            // First probe should be allowed (starts in HALF_OPEN)
            const firstProbe = breaker.exec(slowFn);

            // Second probe should be rejected (exceeds halfOpenMax = 1)
            await expect(breaker.exec(vi.fn())).rejects.toThrow(BreakerOpenError);

            // Complete the first probe
            resolveSlowCall!();
            await firstProbe;

            vi.useRealTimers();
        });

        it('should transition to CLOSED on successful probe', async () => {
            vi.useFakeTimers();

            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 1,
                openMs: 1000,
                halfOpenMax: 2
            });

            const failFn = vi.fn().mockRejectedValue(new Error('Fail'));
            const successFn = vi.fn().mockResolvedValue('success');

            // Trigger OPEN
            await expect(breaker.exec(failFn)).rejects.toThrow();
            expect(breaker.getState()).toBe('open');

            // Wait for timeout
            vi.advanceTimersByTime(1100);

            // Successful probe should close the breaker
            await breaker.exec(successFn);
            expect(breaker.getState()).toBe('closed');

            vi.useRealTimers();
        });

        it('should transition back to OPEN on failed probe', async () => {
            vi.useFakeTimers();

            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 1,
                openMs: 1000,
                halfOpenMax: 2
            });

            const failFn = vi.fn().mockRejectedValue(new Error('Fail'));

            // Trigger OPEN
            await expect(breaker.exec(failFn)).rejects.toThrow('Fail');
            expect(breaker.getState()).toBe('open');

            // Wait for timeout
            vi.advanceTimersByTime(1100);

            // Failed probe should reopen immediately
            await expect(breaker.exec(failFn)).rejects.toThrow('Fail');
            expect(breaker.getState()).toBe('open');

            vi.useRealTimers();
        });
    });

    describe('Edge Cases', () => {
        it('should bypass circuit breaker when disabled', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: false, // Disabled
                failureThreshold: 1,
                openMs: 5000,
                halfOpenMax: 2
            });

            const failFn = vi.fn().mockRejectedValue(new Error('Fail'));

            // Even after many failures, breaker stays closed
            await expect(breaker.exec(failFn)).rejects.toThrow('Fail');
            await expect(breaker.exec(failFn)).rejects.toThrow('Fail');
            await expect(breaker.exec(failFn)).rejects.toThrow('Fail');

            expect(breaker.getState()).toBe('closed');
        });

        it('should handle zero failure threshold', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 0, // Immediate open
                openMs: 5000,
                halfOpenMax: 2
            });

            const failFn = vi.fn().mockRejectedValue(new Error('Fail'));

            // First failure should open immediately
            await expect(breaker.exec(failFn)).rejects.toThrow('Fail');
            expect(breaker.getState()).toBe('open');
        });

        it('should handle successful async function with result', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            const mockFn = vi.fn().mockResolvedValue({ data: 'test', status: 200 });

            const result = await breaker.exec(mockFn);

            expect(result).toEqual({ data: 'test', status: 200 });
        });

        it('should propagate original error (not wrap it)', async () => {
            const breaker = new CircuitBreaker({
                name: 'test-breaker',
                enabled: true,
                failureThreshold: 3,
                openMs: 5000,
                halfOpenMax: 2
            });

            const customError = new Error('Custom API Error');
            const failFn = vi.fn().mockRejectedValue(customError);

            await expect(breaker.exec(failFn)).rejects.toThrow(customError);
        });
    });
});
