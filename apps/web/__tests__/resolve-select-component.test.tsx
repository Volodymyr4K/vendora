import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { SelectComponent } from '@/lib/components/select-base';

// Mock override Select component for testing
const MockOverrideSelect: SelectComponent = () => (
  <div data-tenant-override="unit-test-tenant-select" />
);

describe('resolveSelectComponent', () => {
  it('returns base Select when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveSelectComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getSelect } = await import('@/lib/components/select-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveSelectComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseSelect = getSelect(componentSet);
    expect(resolvedUndefined).toBe(baseSelect);
    
    // Test empty string
    const resolvedEmpty = resolveSelectComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseSelect);
  });

  it('returns override Select when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveSelectComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantSelectOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getSelect } = await import('@/lib/components/select-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-select';
    
    // Register the override
    registerTenantSelectOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideSelect
    );
    
    const resolved = resolveSelectComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideSelect);
    
    // Verify it's not the base component
    const baseSelect = getSelect(componentSet);
    expect(resolved).not.toBe(baseSelect);
  });

  it('returns base Select when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveSelectComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getSelect } = await import('@/lib/components/select-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveSelectComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseSelect = getSelect(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseSelect);
  });

  it('returns override Select when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveSelectComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantSelectOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getSelect } = await import('@/lib/components/select-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-SeLeCt  ';
    const canonicalKey = 'unit-test-tenant-select';
    
    // Register the override with canonical key
    registerTenantSelectOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideSelect
    );
    
    const resolved = resolveSelectComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideSelect);
    
    // Verify it's not the base component
    const baseSelect = getSelect(componentSet);
    expect(resolved).not.toBe(baseSelect);
  });
});
