import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { CheckboxComponent } from '@/lib/components/checkbox-base';

// Mock override Checkbox component for testing
const MockOverrideCheckbox: CheckboxComponent = () => (
  <input data-tenant-override="unit-test-tenant-checkbox" type="checkbox" />
);

describe('resolveCheckboxComponent', () => {
  it('returns base Checkbox when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveCheckboxComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getCheckbox } = await import('@/lib/components/checkbox-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveCheckboxComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseCheckbox = getCheckbox(componentSet);
    expect(resolvedUndefined).toBe(baseCheckbox);
    
    // Test empty string
    const resolvedEmpty = resolveCheckboxComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseCheckbox);
  });

  it('returns override Checkbox when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveCheckboxComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantCheckboxOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getCheckbox } = await import('@/lib/components/checkbox-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-checkbox';
    
    // Register the override
    registerTenantCheckboxOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideCheckbox
    );
    
    const resolved = resolveCheckboxComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideCheckbox);
    
    // Verify it's not the base component
    const baseCheckbox = getCheckbox(componentSet);
    expect(resolved).not.toBe(baseCheckbox);
  });

  it('returns base Checkbox when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveCheckboxComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getCheckbox } = await import('@/lib/components/checkbox-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveCheckboxComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseCheckbox = getCheckbox(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseCheckbox);
  });

  it('returns override Checkbox when tenantOverrideKey has whitespace/mixed case (canonicalized trim+lowercase)', async () => {
    vi.resetModules();
    const { resolveCheckboxComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantCheckboxOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getCheckbox } = await import('@/lib/components/checkbox-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-ChEcKbOx  ';
    const canonicalKey = 'unit-test-tenant-checkbox';
    
    // Register the override with canonical key
    registerTenantCheckboxOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideCheckbox
    );
    
    const resolved = resolveCheckboxComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideCheckbox);
    
    // Verify it's not the base component
    const baseCheckbox = getCheckbox(componentSet);
    expect(resolved).not.toBe(baseCheckbox);
  });
});
