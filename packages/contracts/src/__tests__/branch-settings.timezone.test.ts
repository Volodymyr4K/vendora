/**
 * Tests for zBranchSettings timezone "inherit-only" semantics
 * 
 * Ensures:
 * - Missing timezone key is allowed
 * - Any string timezone is coerced to null (override disabled)
 * - null/undefined remain valid
 */

import { describe, it, expect } from 'vitest';
import { zBranchSettings } from '../index.js';

describe('zBranchSettings timezone handling', () => {
  // Minimal valid object for zBranchSettings
  const minimalValid = {
    deliveryFee: 0,
    freeFrom: 0,
    etaMin: 30,
    etaMax: 60,
    isActive: true,
  };

  it('missing timezone key is allowed', () => {
    const result = zBranchSettings.safeParse(minimalValid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBeUndefined();
    }
  });

  it('string timezone is coerced to null', () => {
    const result = zBranchSettings.safeParse({
      ...minimalValid,
      timezone: 'Europe/Kiev',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBeNull();
    }
  });

  it('whitespace timezone is coerced to null', () => {
    const result = zBranchSettings.safeParse({
      ...minimalValid,
      timezone: '   ',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBeNull();
    }
  });

  it('explicit null stays null', () => {
    const result = zBranchSettings.safeParse({
      ...minimalValid,
      timezone: null,
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.timezone).toBeNull();
    }
  });
});
