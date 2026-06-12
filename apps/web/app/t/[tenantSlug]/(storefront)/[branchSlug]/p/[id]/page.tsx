import { Header, AddToCartButton } from "@/components";
import { getBranchConfig, getMenuCategorySummary, getMenuItem, getTenantConfig } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { notFound } from "next/navigation";
import { getRoutingContext } from "@/lib/routing-context";
import { storefrontHref } from "@/lib/routing-helpers";
import { AmProductPage } from "@/components/main-templates/berlin-press/ProductPage";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";

export const revalidate = 60;

export default async function ProductPage({ params }: { params: Promise<{ branchSlug: string; tenantSlug: string; id: string }> }) {
  const { branchSlug, tenantSlug, id } = await params;
  const [cfg, routingContext, tenantConfig] = await Promise.all([
    getBranchConfig(branchSlug, tenantSlug),
    getRoutingContext(),
    getTenantConfig(tenantSlug),
  ]);
  if (!cfg) notFound();

  if (tenantConfig.mainTemplate === "berlin-press") {
    const { locale } = await getAmLocaleForTenant(tenantSlug);
    const it = await getMenuItem(branchSlug, id, tenantSlug, locale);
    if (!it) notFound();
    const categoryPayload = await getMenuCategorySummary(branchSlug, it.categorySlug, tenantSlug, locale);
    const categoryTitle = categoryPayload?.category?.title ?? it.categorySlug;
    const relatedItems = (categoryPayload?.items ?? [])
      .filter((rel) => rel.categorySlug === it.categorySlug && rel.id !== it.id)
      .slice(0, 4)
      .map((rel) => ({
        ...rel,
        // MenuCategorySummaryPayload items don't include desc, but ProductPage expects it.
        desc: (rel as { desc?: string | null }).desc ?? "",
      }));

    return (
      <AmProductPage
        tenantSlug={tenantSlug}
        branchSlug={branchSlug}
        item={it}
        categoryTitle={categoryTitle}
        relatedItems={relatedItems}
        routingContext={routingContext}
        locale={locale}
        amContent={tenantConfig.amContent}
      />
    );
  }

  const it = await getMenuItem(branchSlug, id, tenantSlug);
  if (!it) notFound();

  return (
    <>
      <Header
        title={it.title}
        subtitle={`${cfg.cityName} • item details (demo)`}
        right={<a className="btn" href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: cfg.slug })}>Back to catalog</a>}
      />

      <div className="card" style={{ display: "grid", gap: 14 }}>
        {it.desc ? <div className="muted" style={{ fontWeight: 800 }}>{it.desc}</div> : null}

        <div className="tagRow">
          {it.weightG ? <span className="tag">{it.weightG} g</span> : null}
          {(it.tags || []).map((t: string) => (
            <span key={t} className="tag">{t}</span>
          ))}
          {it.isAvailable === false ? <span className="tag">out of stock</span> : null}
        </div>

        <div className="row">
          <div>
            <span className="price">{formatPrice(it.price, true)} UAH</span>
            {it.oldPrice ? <span className="priceOld">{formatPrice(it.oldPrice, true)} UAH</span> : null}
          </div>
          <AddToCartButton id={it.id} title={it.title} price={it.price} tenantSlug={tenantSlug} />
        </div>
      </div>
    </>
  );
}
