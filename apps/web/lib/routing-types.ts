export type UrlKind = 'domain' | 'path';
export type TenantMode = 'default' | 'chooser';

export interface RoutingContext {
  kind: UrlKind;
  mode: TenantMode;
  tenantSlug?: string;
  branchSlug?: string;
}
