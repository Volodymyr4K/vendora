import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { CardComponent } from '@/lib/components/card-base';

// Mock override Card component for testing
const MockOverrideCard: CardComponent = ({ children, ...props }) => {
  return (
    <div data-tenant-override="unit-test-tenant-card" {...props}>
      {children}
    </div>
  );
};

describe('resolveCardComponent', () => {
  it('returns base Card when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveCardComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getCard } = await import('@/lib/components/card-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveCardComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseCard = getCard(componentSet);
    expect(resolvedUndefined).toBe(baseCard);
    
    // Test empty string
    const resolvedEmpty = resolveCardComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseCard);
  });

  it('returns override Card when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveCardComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantCardOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getCard } = await import('@/lib/components/card-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-card';
    
    // Register the override
    registerTenantCardOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideCard
    );
    
    const resolved = resolveCardComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideCard);
    
    // Verify it's not the base component
    const baseCard = getCard(componentSet);
    expect(resolved).not.toBe(baseCard);
  });

  it('returns base Card when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveCardComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getCard } = await import('@/lib/components/card-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveCardComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseCard = getCard(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseCard);
  });

  it('returns override Card when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveCardComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantCardOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getCard } = await import('@/lib/components/card-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-CaRd  ';
    const canonicalKey = 'unit-test-tenant-card';
    
    // Register the override with canonical key
    registerTenantCardOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideCard
    );
    
    const resolved = resolveCardComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideCard);
    
    // Verify it's not the base component
    const baseCard = getCard(componentSet);
    expect(resolved).not.toBe(baseCard);
  });
});
