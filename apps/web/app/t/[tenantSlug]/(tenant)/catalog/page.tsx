import { redirect } from "next/navigation";
import { FetchJsonError, getDefaultBranch, getMenu, getTenantConfig } from "@/lib/data";
import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { AmCatalogPage } from "@/components/main-templates/berlin-press/Catalog";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";

export default async function TenantCatalogPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
    const { tenantSlug } = await params;
    const config = await getTenantConfig(tenantSlug);
    if (config.mainTemplate !== "berlin-press") {
        redirect(`/t/${tenantSlug}/main`);
    }
    const [routingContext, { locale }, branchResult] = await Promise.all([
        getRoutingContext(),
        getAmLocaleForTenant(tenantSlug),
        getDefaultBranch(tenantSlug).catch((err) => err),
    ]);

    if (branchResult instanceof FetchJsonError && (branchResult.status === 404 || branchResult.status === 409)) {
        const returnTo = tenantHref(routingContext, "/catalog");
        redirect(`${tenantHref(routingContext, "/choose-city")}?returnTo=${encodeURIComponent(returnTo)}`);
    }
    if (branchResult instanceof Error) {
        throw branchResult;
    }
    const branchSlug = branchResult.slug;

    const catalogMenu = await getMenu(branchSlug, tenantSlug, locale);

    return (
        <AmFullBleed>
            <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
            <AmCatalogPage tenantSlug={tenantSlug} branchSlug={branchSlug} menu={catalogMenu} routingContext={routingContext} locale={locale} amContent={config.amContent} />
            <AmFooter locale={locale} amContent={config.amContent} />
        </AmFullBleed>
    );
}
