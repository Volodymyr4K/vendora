/**
 * (storefront) layout — menu, checkout, cart, etc.
 * Loads BranchConfig (tenant + branch), applies theme (audit 3.5, 3.9 E).
 * Phase 2.2: Uses layout registry for layoutPreset-based wrapper.
 * Phase 3.2: Uses topbar registry for componentSet-based topbar.
 * V1: no silent fallback — getBranchConfig failure or missing theme throws (error boundary).
 */
import type { Metadata } from "next";
import { headers } from "next/headers";
import { getBranchConfig, getTenantConfig } from "@/lib/data";
import { themeToCssVars, themeVarsToCssString } from "@/lib/theme/server";
import { resolveGoogleFontUrl } from "@/lib/theme/fonts";
import { getLayout } from "@/lib/layout/registry";
import { getThemedTopbar } from "@/lib/components/topbar-registry";
import { ThemeProvider } from "@/lib/theme/client";

import { notFound } from "next/navigation";

export async function generateMetadata(
  { params }: { params: Promise<{ branchSlug: string; tenantSlug: string }> }
): Promise<Metadata> {
  const { branchSlug, tenantSlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) return {};

  const brandTitle = cfg.tenant?.name || "Vendora";

  const headersList = await headers();
  const host = headersList.get("host") || "";

  const serviceHost = process.env.SERVICE_DOMAIN || "";
  const serviceSuffix = process.env.SERVICE_DOMAIN_SUFFIX || "";

  // Deterministic checks for "Service Domain" vs "Custom Domain"
  const isServiceDomain =
    host === "localhost:3000" ||
    host.endsWith(".localhost:3000") ||
    host.endsWith(".localhost") ||
    (serviceHost && host === serviceHost) ||
    (serviceSuffix && host.endsWith(serviceSuffix));

  const canonical = isServiceDomain
    ? `/t/${tenantSlug}/${cfg.slug}`
    : `/${cfg.slug}`;

  return {
    title: `${brandTitle} — delivery in ${cfg.cityName}`,
    description: `Catalog, delivery and contacts: ${cfg.cityName}.`,
    alternates: { canonical },
    openGraph: { title: `${brandTitle} — ${cfg.cityName}`, type: "website" },
  };
}

export default async function BranchLayout({ children, params }: { children: React.ReactNode; params: Promise<{ branchSlug: string; tenantSlug: string }> }) {
  const { branchSlug, tenantSlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  const tenantConfig = await getTenantConfig(tenantSlug);

  if (!cfg) {
    notFound();
  }
  if (!cfg.tenant.theme) {
    // Should never happen - Zod guarantees tenant.theme exists (Phase 1.12)
    throw new Error("Phase 1.12: BranchConfig.tenant.theme guaranteed by required contract");
  }

  const themeVars = themeToCssVars(cfg.tenant.theme);
  const cssString = themeVarsToCssString(themeVars);
  const Layout = getLayout(cfg.tenant.theme.layoutPreset);
  const Topbar = getThemedTopbar({ componentSet: cfg.tenant.theme.componentSet, tenantOverrideKey: tenantSlug });
  const fontHref = resolveGoogleFontUrl(cfg.tenant.theme.brand?.fontUrl);
  const hideTopbar = tenantConfig.mainTemplate === "berlin-press";

  return (
    <>
      {fontHref ? (
        <>
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
          <link rel="stylesheet" href={fontHref} />
        </>
      ) : null}
      <style>{`:root{${cssString}}`}</style>
      <ThemeProvider value={cfg.tenant.theme}>
        {hideTopbar ? null : <Topbar cfg={cfg} tenantSlug={tenantSlug} />}
        <Layout>{children}</Layout>
      </ThemeProvider>
    </>
  );
}
