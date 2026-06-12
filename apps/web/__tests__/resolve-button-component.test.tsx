import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { ButtonComponent } from '@/lib/components/button-base';

// Mock override Button component for testing
const MockOverrideButton: ButtonComponent = ({ children, ...props }) => {
  return (
    <button data-tenant-override="unit-test-tenant" {...props}>
      {children}
    </button>
  );
};

describe('resolveButtonComponent', () => {
  it('returns base Button when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveButtonComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getButton } = await import('@/lib/components/button-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveButtonComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseButton = getButton(componentSet);
    expect(resolvedUndefined).toBe(baseButton);
    
    // Test empty string
    const resolvedEmpty = resolveButtonComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseButton);
  });

  it('returns override Button when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveButtonComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantButtonOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getButton } = await import('@/lib/components/button-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant';
    
    // Register the override
    registerTenantButtonOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideButton
    );
    
    const resolved = resolveButtonComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideButton);
    
    // Verify it's not the base component
    const baseButton = getButton(componentSet);
    expect(resolved).not.toBe(baseButton);
  });

  it('returns base Button when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveButtonComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getButton } = await import('@/lib/components/button-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveButtonComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseButton = getButton(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseButton);
  });

  it('returns override Button when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveButtonComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantButtonOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getButton } = await import('@/lib/components/button-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt  ';
    const canonicalKey = 'unit-test-tenant';
    
    // Register the override with canonical key
    registerTenantButtonOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideButton
    );
    
    const resolved = resolveButtonComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideButton);
    
    // Verify it's not the base component
    const baseButton = getButton(componentSet);
    expect(resolved).not.toBe(baseButton);
  });
});
