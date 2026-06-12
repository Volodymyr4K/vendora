import { Header, AddToCartButton, FavoriteButton } from "@/components";
import { getBranchConfig, getDelivery, getMenuCategory, getTenantConfig } from "@/lib/data";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { formatPrice, formatTodayHours } from "@/lib/format";
import { isFeatureEnabled } from "@/lib/feature-helpers";
import { notFound } from "next/navigation";
import type { MenuCategoryPayload } from "@vendora/contracts";
import { getRoutingContext } from "@/lib/routing-context";
import { storefrontHref } from "@/lib/routing-helpers";

export default async function BranchHome({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
  const { branchSlug, tenantSlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) return notFound();
  const routingContext = await getRoutingContext();

  const tenantCfg = await getTenantConfig(tenantSlug);
  const deliveryEnabled = isFeatureEnabled(tenantCfg.features, "basicDelivery", "delivery");
  const delivery = deliveryEnabled
    ? await getDelivery(branchSlug, tenantSlug)
    : { mode: "fallback" as const, message: "Доставка недоступна для цього закладу." };
  const locale = tenantSlug === "berlin-press"
    ? (await getAmLocaleForTenant(tenantSlug)).locale
    : undefined;
  // Using 'rolls' as hits since 'hits' category is missing
  const hits = await getMenuCategory(branchSlug, "rolls", tenantSlug, locale).catch(() => null);

  return (
    <>
      <Header
        title={`${cfg.cityName}: замовлення онлайн`}
        subtitle="Каталог → кошик → розрахунок → створення замовлення (demo)"
        right={<a className="btn" href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: cfg.slug })}>Відкрити каталог</a>}
      />

      <div className="card">
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <span className="pill"><span className="pillDot" />{formatTodayHours(cfg.workingSchedule)}</span>
          <span className="pill"><span className="pillDot" />{cfg.address ?? "Адреса"}</span>
          <span className="pill"><span className="pillDot" />{cfg.phones[0] ?? "Телефон"}</span>
        </div>

        <hr />

        <div style={{ fontWeight: 950, letterSpacing: "-.3px" }}>Доставка</div>
        <div className="muted" style={{ marginTop: 6, fontWeight: 800, lineHeight: 1.35 }}>
          {"mode" in delivery && delivery.mode === "fallback" ? (
            delivery.message
          ) : (
            <>
              <>
                {delivery.cfg.deliveryFee} грн • безкоштовно від {delivery.cfg.freeFrom} грн • ETA {delivery.cfg.etaMin}–{delivery.cfg.etaMax} хв
                {delivery.cfg.zones?.length ? <><br />Зони: {delivery.cfg.zones.join(", ")}</> : null}
              </>
            </>
          )}
        </div>
      </div>

      {hits ? (
        <section style={{ marginTop: 14 }}>
          <div className="card">
            <h2 className="sectionTitle">Хіти сьогодні</h2>
            <div className="sectionSub">Кілька позицій, щоб «відчути» продукт у зборці.</div>
            <div className="grid3">
              {hits.items.slice(0, 6).map((it: MenuCategoryPayload["items"][number]) => (
                <div key={it.id} className="card product">
                  <div>
                    <a
                      className="link"
                      href={storefrontHref(routingContext, `/p/${it.slug || it.id}`, { explicitBranchSlug: cfg.slug })}
                      style={{ textDecoration: "none" }}
                    >
                      <p className="productTitle">{it.title}</p>
                    </a>
                    {it.desc ? <p className="productDesc">{it.desc}</p> : null}
                    <div className="tagRow" style={{ marginTop: 8 }}>
                      {it.weightG ? <span className="tag">{it.weightG} г</span> : null}
                      {(it.tags || []).slice(0, 2).map((t: string) => (
                        <span key={t} className="tag">{t}</span>
                      ))}
                    </div>
                  </div>
                  <div className="priceRow">
                    <div>
                      <span className="price">{formatPrice(it.price, true)} грн</span>
                      {it.oldPrice ? <span className="priceOld">{formatPrice(it.oldPrice, true)} грн</span> : null}
                    </div>
                    <div style={{ position: "absolute", top: 8, right: 8, zIndex: 10 }}>
                      <FavoriteButton productId={it.id} tenantSlug={tenantSlug} />
                    </div>
                    <div style={{ position: "absolute", top: 12, right: 12, zIndex: 10 }}>
                      <FavoriteButton productId={it.id} tenantSlug={tenantSlug} />
                    </div>
                    <AddToCartButton id={it.id} title={it.title} price={it.price} tenantSlug={tenantSlug} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </>
  );
}
