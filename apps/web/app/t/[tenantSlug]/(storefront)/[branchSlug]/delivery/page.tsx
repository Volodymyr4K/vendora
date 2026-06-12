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
    : { mode: "fallback" as const, message: "Delivery is unavailable for this venue." };

  return (
    <>
      <Header
        title={`Delivery • ${cfg.cityName}`}
        subtitle="Terms/zones/ETA (demo)"
        right={<a className="btn" href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: cfg.slug })}>Catalog</a>}
      />
      <div className="card">
        <div><b>Branch:</b> {cfg.cityName} • {cfg.slug}</div>
        <div style={{ marginTop: 6 }}><b>Address:</b> {cfg.address || "—"}</div>
        <div style={{ marginTop: 6 }}><b>Hours:</b> {formatTodayHours(cfg.workingSchedule) === "Hours" ? "—" : formatTodayHours(cfg.workingSchedule)}</div>
        <div style={{ marginTop: 6 }}><b>Phone:</b> {cfg.phones?.[0] || "—"}</div>
        <hr />
        {"mode" in delivery && delivery.mode === "fallback" ? (
          <div className="muted" style={{ fontWeight: 800 }}>{delivery.message}</div>
        ) : (
          <>
            <div><b>Fee:</b> {delivery.cfg.deliveryFee} UAH</div>
            <div style={{ marginTop: 6 }}><b>Free from:</b> {delivery.cfg.freeFrom} UAH</div>
            <div style={{ marginTop: 6 }}><b>Time:</b> {delivery.cfg.etaMin}–{delivery.cfg.etaMax} min</div>
            {delivery.cfg.zones?.length ? <div style={{ marginTop: 6 }}><b>Zones:</b> {delivery.cfg.zones.join(", ")}</div> : null}
          </>
        )}
      </div>
    </>
  );
}
