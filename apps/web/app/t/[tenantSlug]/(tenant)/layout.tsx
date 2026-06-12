/**
 * (tenant) route group layout — login, profile, choose-city.
 * Fetches GET /config, applies theme CSS vars (audit 3.5, 3.9 E).
 * Phase 2.2: Uses layout registry for layoutPreset-based wrapper.
 * V1: no silent fallback — getTenantConfig failure or missing theme throws (error boundary).
 */
import { getTenantConfig } from "@/lib/data";
import { pickLocalized } from "@/lib/am-content";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { resolveGoogleFontUrl } from "@/lib/theme/fonts";
import { themeToCssVars, themeVarsToCssString } from "@/lib/theme/server";
import { getLayout } from "@/lib/layout/registry";
import { ThemeProvider } from "@/lib/theme/client";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}): Promise<Metadata> {
  const { tenantSlug } = await params;
  const [config, localeConfig] = await Promise.all([
    getTenantConfig(tenantSlug),
    getAmLocaleForTenant(tenantSlug),
  ]);
  const brandText = pickLocalized(
    config.amContent?.header?.brand?.text,
    localeConfig.locale,
    config.mainTemplate === "berlin-press" ? "BERLIN PRESS" : ""
  );
  const brandTitle = brandText || "Vendora";
  return {
    title: {
      default: brandTitle,
      template: `%s • ${brandTitle}`,
    },
  };
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const config = await getTenantConfig(tenantSlug);
  if (!config.theme) {
    throw new Error("V1: BFF must always return theme in GET /config");
  }
  const themeVars = themeToCssVars(config.theme);
  const cssString = themeVarsToCssString(themeVars);
  const Layout = getLayout(config.theme.layoutPreset);
  const fontHref = resolveGoogleFontUrl(config.theme.brand?.fontUrl);

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
      <ThemeProvider value={config.theme}>
        <Layout>{children}</Layout>
      </ThemeProvider>
    </>
  );
}
