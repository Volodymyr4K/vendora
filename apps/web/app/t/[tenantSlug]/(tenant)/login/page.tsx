/**
 * Login page — server component; config from getTenantConfig (deduplicated with (tenant)/layout).
 * No client fetch: single source from server.
 */
import { getTenantConfig } from "@/lib/data";
import { LoginForm } from "@/components/auth/LoginForm";

export default async function LoginPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const config = await getTenantConfig(tenantSlug);
  const countryCode = config.countryCode ?? "UA";
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-accent-weak via-paper to-accent-weak px-4 py-12">
      <LoginForm tenantSlug={tenantSlug} countryCode={countryCode} />
    </div>
  );
}
