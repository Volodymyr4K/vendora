import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import type { TextareaComponent } from '@/lib/components/textarea-base';

// Mock override Textarea component for testing
const MockOverrideTextarea: TextareaComponent = () => (
  <textarea data-tenant-override="unit-test-tenant-textarea" />
);

describe('resolveTextareaComponent', () => {
  it('returns base Textarea when tenantOverrideKey is undefined OR empty string', async () => {
    vi.resetModules();
    const { resolveTextareaComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getTextarea } = await import('@/lib/components/textarea-base');
    
    const componentSet = 'default';
    
    // Test undefined
    const resolvedUndefined = resolveTextareaComponent({
      tenantOverrideKey: undefined,
      componentSet,
    });
    const baseTextarea = getTextarea(componentSet);
    expect(resolvedUndefined).toBe(baseTextarea);
    
    // Test empty string
    const resolvedEmpty = resolveTextareaComponent({
      tenantOverrideKey: '',
      componentSet,
    });
    expect(resolvedEmpty).toBe(baseTextarea);
  });

  it('returns override Textarea when tenantOverrideKey matches registered override', async () => {
    vi.resetModules();
    const { resolveTextareaComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantTextareaOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getTextarea } = await import('@/lib/components/textarea-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unit-test-tenant-textarea';
    
    // Register the override
    registerTenantTextareaOverride(
      tenantOverrideKey,
      componentSet,
      'default',
      MockOverrideTextarea
    );
    
    const resolved = resolveTextareaComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component
    expect(resolved).toBe(MockOverrideTextarea);
    
    // Verify it's not the base component
    const baseTextarea = getTextarea(componentSet);
    expect(resolved).not.toBe(baseTextarea);
  });

  it('returns base Textarea when tenantOverrideKey is unknown', async () => {
    vi.resetModules();
    const { resolveTextareaComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { getTextarea } = await import('@/lib/components/textarea-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = 'unknown-tenant-key';
    
    const resolved = resolveTextareaComponent({
      tenantOverrideKey,
      componentSet,
    });
    const baseTextarea = getTextarea(componentSet);
    
    // Should fall back to base component
    expect(resolved).toBe(baseTextarea);
  });

  it('returns override Textarea when tenantOverrideKey has whitespace and mixed case (canonicalized)', async () => {
    vi.resetModules();
    const { resolveTextareaComponent } = await import('@/lib/theme/component-overrides/resolvers');
    const { registerTenantTextareaOverride } = await import('@/lib/theme/component-overrides/registry');
    const { getTextarea } = await import('@/lib/components/textarea-base');
    
    const componentSet = 'default';
    const tenantOverrideKey = '  UnIt-TeSt-TeNaNt-TeXtArEa  ';
    const canonicalKey = 'unit-test-tenant-textarea';
    
    // Register the override with canonical key
    registerTenantTextareaOverride(
      canonicalKey,
      componentSet,
      'default',
      MockOverrideTextarea
    );
    
    const resolved = resolveTextareaComponent({
      tenantOverrideKey,
      componentSet,
    });
    
    // Should return the override component (canonicalization should handle trim+lowercase)
    expect(resolved).toBe(MockOverrideTextarea);
    
    // Verify it's not the base component
    const baseTextarea = getTextarea(componentSet);
    expect(resolved).not.toBe(baseTextarea);
  });
});
