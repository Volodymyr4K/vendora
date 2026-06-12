import 'server-only';

import { headers } from 'next/headers';
import type { RoutingContext, UrlKind, TenantMode } from './routing-types';

function parseKind(value: string | null): UrlKind {
  return value === 'domain' || value === 'path' ? value : 'path';
}

function parseMode(value: string | null): TenantMode {
  return value === 'default' || value === 'chooser' ? value : 'chooser';
}

export async function getRoutingContext(): Promise<RoutingContext> {
  const headerStore = await headers();

  const kind = parseKind(headerStore.get('x-url-kind'));
  const mode = parseMode(headerStore.get('x-tenant-mode'));
  const tenantSlug = headerStore.get('x-tenant-slug') || undefined;
  const branchSlug = headerStore.get('x-branch-slug') || undefined;

  return { kind, mode, tenantSlug, branchSlug };
}
