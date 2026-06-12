import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { InputComponent } from '@/lib/components/input-base';

// Mock override Input component for testing
const MockOverrideInput: InputComponent = (props) => {
  return (
    <input data-tenant-override="unit-test-tenant-input" {...props} />
  );
};

describe('resolveInputComponent', () => {
  it('returns base Input when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveInputComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getInput } = await import('@/lib/components/input-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveInputComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseInput = getInput(componentSet);
    expect(resolvedUndefined).toBe(baseInput);
    
    // Test empty string
    const resolvedEmpty = resolveInputComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseInput);
  });

  it('returns override Input when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveInputComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantInputOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getInput } = await import('@/lib/components/input-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-input';
    
    // Register the override
    registerTenantInputOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideInput
    );
    
    const resolved = resolveInputComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideInput);
    
    // Verify it's not the base component
    const baseInput = getInput(componentSet);
    expect(resolved).not.toBe(baseInput);
  });

  it('returns base Input when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveInputComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getInput } = await import('@/lib/components/input-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveInputComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseInput = getInput(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseInput);
  });

  it('returns override Input when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveInputComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantInputOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getInput } = await import('@/lib/components/input-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-InPuT  ';
    const canonicalKey = 'unit-test-tenant-input';
    
    // Register the override with canonical key
    registerTenantInputOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideInput
    );
    
    const resolved = resolveInputComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideInput);
    
    // Verify it's not the base component
    const baseInput = getInput(componentSet);
    expect(resolved).not.toBe(baseInput);
  });
});
