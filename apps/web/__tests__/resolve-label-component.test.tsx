import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { LabelComponent } from '@/lib/components/label-base';

// Mock override Label component for testing
const MockOverrideLabel: LabelComponent = () => (
  <label data-tenant-override="unit-test-tenant-label" />
);

describe('resolveLabelComponent', () => {
  it('returns base Label when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveLabelComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getLabel } = await import('@/lib/components/label-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveLabelComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseLabel = getLabel(componentSet);
    expect(resolvedUndefined).toBe(baseLabel);
    
    // Test empty string
    const resolvedEmpty = resolveLabelComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseLabel);
  });

  it('returns override Label when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveLabelComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantLabelOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getLabel } = await import('@/lib/components/label-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-label';
    
    // Register the override
    registerTenantLabelOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideLabel
    );
    
    const resolved = resolveLabelComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideLabel);
    
    // Verify it's not the base component
    const baseLabel = getLabel(componentSet);
    expect(resolved).not.toBe(baseLabel);
  });

  it('returns base Label when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveLabelComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getLabel } = await import('@/lib/components/label-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveLabelComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseLabel = getLabel(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseLabel);
  });

  it('returns override Label when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveLabelComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantLabelOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getLabel } = await import('@/lib/components/label-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-LaBeL  ';
    const canonicalKey = 'unit-test-tenant-label';
    
    // Register the override with canonical key
    registerTenantLabelOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideLabel
    );
    
    const resolved = resolveLabelComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideLabel);
    
    // Verify it's not the base component
    const baseLabel = getLabel(componentSet);
    expect(resolved).not.toBe(baseLabel);
  });
});
