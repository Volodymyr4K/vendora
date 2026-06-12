import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { TopbarComponent } from '@/lib/components/topbar-registry';

// Mock override Topbar component for testing
const MockOverrideTopbar: TopbarComponent = ({ tenantSlug }) => {
  return (
    <div data-tenant-override="unit-test-tenant" data-tenant-slug={tenantSlug}>
      Mock Topbar
    </div>
  );
};

describe('resolveTopbarComponent', () => {
  it('returns base Topbar when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveTopbarComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getTopbar } = await import('@/lib/components/topbar-registry');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveTopbarComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseTopbar = getTopbar(componentSet);
    expect(resolvedUndefined).toBe(baseTopbar);
    
    // Test empty string
    const resolvedEmpty = resolveTopbarComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseTopbar);
  });

  it('returns override Topbar when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveTopbarComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantTopbarOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getTopbar } = await import('@/lib/components/topbar-registry');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant';
    
    // Register the override
    registerTenantTopbarOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideTopbar
    );
    
    const resolved = resolveTopbarComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideTopbar);
    
    // Verify it's not the base component
    const baseTopbar = getTopbar(componentSet);
    expect(resolved).not.toBe(baseTopbar);
  });

  it('returns base Topbar when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveTopbarComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getTopbar } = await import('@/lib/components/topbar-registry');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveTopbarComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseTopbar = getTopbar(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseTopbar);
  });

  it('returns override Topbar when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveTopbarComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantTopbarOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getTopbar } = await import('@/lib/components/topbar-registry');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt  ';
    const canonicalKey = 'unit-test-tenant';
    
    // Register the override with canonical key
    registerTenantTopbarOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideTopbar
    );
    
    const resolved = resolveTopbarComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideTopbar);
    
    // Verify it's not the base component
    const baseTopbar = getTopbar(componentSet);
    expect(resolved).not.toBe(baseTopbar);
  });
});
