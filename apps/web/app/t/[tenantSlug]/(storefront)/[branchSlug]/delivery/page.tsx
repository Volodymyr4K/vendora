import { Header } from "@/components";
import { getBranchConfig, getDelivery, getTenantConfig } from "@/lib/data";
import { isFeatureEnabled } from "@/lib/feature-helpers";
import { formatTodayHours } from "@/lib/format";
import { notFound } from "next/navigation";
import { getRoutingContext } from "@/lib/routing-context";
import { storefrontHref } from "@/lib/routing-helpers";

export default async function DeliveryPage({ params }: { params: Promise<{ tenantSlug: string; branchSlug: string }> }) {
  const { branchSlug, tenantSlug } = await params;
  const cfg = await getBranchConfig(branchSlug, tenantSlug);
  if (!cfg) notFound();
  const routingContext = await getRoutingContext();
  const tenantCfg = await getTenantConfig(tenantSlug);
  const deliveryEnabled = isFeatureEnabled(tenantCfg.features, "basicDelivery", "delivery");
  const delivery = deliveryEnabled
    ? await getDelivery(branchSlug, tenantSlug)
    : { mode: "fallback" as const, message: "Доставка недоступна для цього закладу." };

  return (
    <>
      <Header
        title={`Доставка • ${cfg.cityName}`}
        subtitle="Умови/зони/ETA (demo)"
        right={<a className="btn" href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: cfg.slug })}>Каталог</a>}
      />
      <div className="card">
        <div><b>Філія:</b> {cfg.cityName} • {cfg.slug}</div>
        <div style={{ marginTop: 6 }}><b>Адреса:</b> {cfg.address || "—"}</div>
        <div style={{ marginTop: 6 }}><b>Години:</b> {formatTodayHours(cfg.workingSchedule) === "Графік" ? "—" : formatTodayHours(cfg.workingSchedule)}</div>
        <div style={{ marginTop: 6 }}><b>Телефон:</b> {cfg.phones?.[0] || "—"}</div>
        <hr />
        {"mode" in delivery && delivery.mode === "fallback" ? (
          <div className="muted" style={{ fontWeight: 800 }}>{delivery.message}</div>
        ) : (
          <>
            <div><b>Вартість:</b> {delivery.cfg.deliveryFee} грн</div>
            <div style={{ marginTop: 6 }}><b>Безкоштовно від:</b> {delivery.cfg.freeFrom} грн</div>
            <div style={{ marginTop: 6 }}><b>Час:</b> {delivery.cfg.etaMin}–{delivery.cfg.etaMax} хв</div>
            {delivery.cfg.zones?.length ? <div style={{ marginTop: 6 }}><b>Зони:</b> {delivery.cfg.zones.join(", ")}</div> : null}
          </>
        )}
      </div>
    </>
  );
}
