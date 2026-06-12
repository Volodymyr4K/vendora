import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { BadgeComponent } from '@/lib/components/badge-base';

// Mock override Badge component for testing
const MockOverrideBadge: BadgeComponent = ({ children, ...props }) => (
  <span data-tenant-override="unit-test-tenant-badge" {...props}>
    {children}
  </span>
);

describe('resolveBadgeComponent', () => {
  it('returns base Badge when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveBadgeComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getBadge } = await import('@/lib/components/badge-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveBadgeComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseBadge = getBadge(componentSet);
    expect(resolvedUndefined).toBe(baseBadge);
    
    // Test empty string
    const resolvedEmpty = resolveBadgeComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseBadge);
  });

  it('returns override Badge when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveBadgeComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantBadgeOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getBadge } = await import('@/lib/components/badge-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-badge';
    
    // Register the override
    registerTenantBadgeOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideBadge
    );
    
    const resolved = resolveBadgeComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideBadge);
    
    // Verify it's not the base component
    const baseBadge = getBadge(componentSet);
    expect(resolved).not.toBe(baseBadge);
  });

  it('returns base Badge when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveBadgeComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getBadge } = await import('@/lib/components/badge-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveBadgeComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseBadge = getBadge(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseBadge);
  });

  it('returns override Badge when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveBadgeComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantBadgeOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getBadge } = await import('@/lib/components/badge-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-BaDgE  ';
    const canonicalKey = 'unit-test-tenant-badge';
    
    // Register the override with canonical key
    registerTenantBadgeOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideBadge
    );
    
    const resolved = resolveBadgeComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideBadge);
    
    // Verify it's not the base component
    const baseBadge = getBadge(componentSet);
    expect(resolved).not.toBe(baseBadge);
  });
});
