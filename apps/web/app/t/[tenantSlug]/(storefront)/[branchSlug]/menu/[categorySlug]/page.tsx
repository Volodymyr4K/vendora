import { Header, ErrorBanner, AddToCartButton, CartLink } from "@/components";
import { getBranchConfig, fetchProxy } from "@/lib/data";
import { formatPrice } from "@/lib/format";
import { notFound } from "next/navigation";
import { zMenuCategorySummaryPayload, type MenuCategorySummaryPayload } from "@vendora/contracts";
import { getRoutingContext } from "@/lib/routing-context";
import { storefrontHref } from "@/lib/routing-helpers";
import { getBffBaseUrl } from "@/lib/bffBase";

const BFF = getBffBaseUrl();

export const revalidate = 60;

export default async function CategoryPage({
  params,
}: { params: Promise<{ branchSlug: string; tenantSlug: string; categorySlug: string }> }) {
  const { branchSlug, tenantSlug, categorySlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) notFound();
  const routingContext = await getRoutingContext();

  let payload: MenuCategorySummaryPayload;
  try {
    const r = await fetchProxy(`${BFF}/menu/category/${categorySlug}/summary?branchSlug=${branchSlug}`, {
      cache: "no-store",
      xTenantSlug: tenantSlug,
    });
    if (!r.ok) throw new Error("Fetch failed");

    const json: unknown = await r.json();
    const parsed = zMenuCategorySummaryPayload.safeParse(json);

    if (!parsed.success) {
      throw new Error("MENU_CATEGORY_INVALID_PAYLOAD");
    }
    payload = parsed.data;
  } catch (error) {
    return (
      <>
        <Header title={`Категорія • ${cfg.cityName}`} right={<CartLink branchSlug={cfg.slug} />} />
        <ErrorBanner
          title="Не вдалося завантажити категорію"
          details="Спробуйте ще раз або зверніться в контакти."
          contactsHref={storefrontHref(routingContext, "/", { explicitBranchSlug: cfg.slug })}
          retryHref={storefrontHref(routingContext, `/menu/${categorySlug}`, { explicitBranchSlug: cfg.slug })}
        />
      </>
    );
  }

  return (
    <>
      <Header title={`Категорія: ${categorySlug}`} subtitle={`Філія: ${cfg.slug}`} right={<CartLink branchSlug={cfg.slug} />} />
      <div className="card">
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 12 }}>
          {payload.items.map((it) => (
            <div key={it.id} className="card" style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center" }}>
              <a
                href={storefrontHref(routingContext, `/p/${it.slug || it.id}`, { explicitBranchSlug: cfg.slug })}
                style={{ textDecoration: "none", color: "inherit", minWidth: 0 }}
              >
                <div style={{ fontWeight: 950, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.title}</div>
                <div className="muted" style={{ marginTop: 6 }}>{formatPrice(it.price, true)} грн</div>
              </a>
              <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
                <AddToCartButton id={it.id} title={it.title} price={it.price} tenantSlug={tenantSlug} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
