"use client";

import React from "react";
import type { BranchConfig } from "@vendora/contracts";
import { formatTodayHours } from "@/lib/format";
import { CartLink } from "./cart/CartLink";
import { isFeatureEnabled, isMasterFeatureEnabled } from "@/lib/feature-helpers";
import { useRoutingContext } from "./RoutingContextProvider";
import { storefrontHref, tenantHref } from "@/lib/routing-helpers";

export function SiteTopbar() {
  const routingContext = useRoutingContext();
  return (
    <div className="topbar">
      <div className="topbarInner">
        <a className="brand" href={storefrontHref(routingContext, "/")} aria-label="Vendora">
          <div className="logo" />
          <div style={{ display: "grid" }}>
            <div className="brandTitle">Vendora</div>
            <div className="brandSubtitle">vNext demo build</div>
          </div>
        </a>

        <nav className="nav">
          <a className="btn" href={tenantHref(routingContext, "/choose-city")}>
            Обрати місто
          </a>
          <a className="btn" href={tenantHref(routingContext, "/privacy")}>
            Privacy
          </a>
          <a className="btn" href={tenantHref(routingContext, "/terms")}>
            Terms
          </a>
        </nav>
      </div>
    </div>
  );
}

export function BranchTopbar(props: { cfg: BranchConfig; tenantSlug?: string }) {
  const cfg = props.cfg;
  const { tenantSlug } = props;
  const routingContext = useRoutingContext();
  const brandName = cfg.tenant?.name ?? "Vendora";
  const branchBase = storefrontHref(routingContext, "/", { explicitBranchSlug: cfg.slug });
  const profileHref = tenantHref(routingContext, "/profile");
  const features = cfg.features;
  const menuEnabled = isMasterFeatureEnabled(features, "menu");
  const deliveryEnabled = isFeatureEnabled(features, "basicDelivery", "delivery");
  const orderingEnabled = isMasterFeatureEnabled(features, "ordering");
  const profileEnabled = isMasterFeatureEnabled(features, "profile");
  const cartEnabled = isFeatureEnabled(features, "cartCheckout", "ordering");
  return (
    <div className="topbar">
      <div className="topbarInner">
        <a className="brand" href={branchBase} aria-label={`${brandName} • ${cfg.cityName}`}>
          <div className="logo" />
          <div style={{ display: "grid" }}>
            <div className="brandTitle">{brandName} • {cfg.cityName}</div>
            <div className="brandSubtitle">{formatTodayHours(cfg.workingSchedule) !== "Графік" ? `${formatTodayHours(cfg.workingSchedule)} • ` : ""}{cfg.address ?? ""}</div>
          </div>
        </a>

        <nav className="nav">
          {menuEnabled && (
            <a className="btn" href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: cfg.slug })}>
              Каталог
            </a>
          )}
          {deliveryEnabled && (
            <a className="btn" href={storefrontHref(routingContext, "/delivery", { explicitBranchSlug: cfg.slug })}>
              Доставка
            </a>
          )}

          {/* Checkout/Ordering - visible by default, hidden only if explicitly disabled */}
          {orderingEnabled && (
            <a className="btn" href={storefrontHref(routingContext, "/checkout", { explicitBranchSlug: cfg.slug })}>
              Checkout
            </a>
          )}

          <a className="btn" href={tenantHref(routingContext, "/choose-city")}>
            Місто
          </a>

          {/* Profile - visible by default, hidden only if explicitly disabled */}
          {profileEnabled && (
            <a className="btn" href={profileHref}>
              Кабінет
            </a>
          )}

          {/* Cart - PHASE 9: Check cartCheckout granular flag, fallback to ordering master */}
          {cartEnabled && (
            <CartLink branchSlug={cfg.slug} tenantSlug={tenantSlug} />
          )}
        </nav>
      </div>
    </div>
  );
}
