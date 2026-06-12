import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { RadioComponent } from '@/lib/components/radio-base';

// Mock override Radio component for testing
const MockOverrideRadio: RadioComponent = () => (
  <input data-tenant-override="unit-test-tenant-radio" type="radio" />
);

describe('resolveRadioComponent', () => {
  it('returns base Radio when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveRadioComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getRadio } = await import('@/lib/components/radio-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveRadioComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseRadio = getRadio(componentSet);
    expect(resolvedUndefined).toBe(baseRadio);
    
    // Test empty string
    const resolvedEmpty = resolveRadioComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseRadio);
  });

  it('returns override Radio when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveRadioComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantRadioOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getRadio } = await import('@/lib/components/radio-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-radio';
    
    // Register the override
    registerTenantRadioOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideRadio
    );
    
    const resolved = resolveRadioComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideRadio);
    
    // Verify it's not the base component
    const baseRadio = getRadio(componentSet);
    expect(resolved).not.toBe(baseRadio);
  });

  it('returns base Radio when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveRadioComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getRadio } = await import('@/lib/components/radio-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveRadioComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseRadio = getRadio(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseRadio);
  });

  it('returns override Radio when tenantOverrideKey has whitespace/mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveRadioComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantRadioOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getRadio } = await import('@/lib/components/radio-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-RaDiO  ';
    const canonicalKey = 'unit-test-tenant-radio';
    
    // Register the override with canonical key
    registerTenantRadioOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideRadio
    );
    
    const resolved = resolveRadioComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideRadio);
    
    // Verify it's not the base component
    const baseRadio = getRadio(componentSet);
    expect(resolved).not.toBe(baseRadio);
  });
});
