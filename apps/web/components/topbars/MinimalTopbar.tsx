"use client";

import type { BranchConfig } from "@vendora/contracts";
import { isFeatureEnabled, isMasterFeatureEnabled } from "@/lib/feature-helpers";
import { useRoutingContext } from "@/components/RoutingContextProvider";
import { storefrontHref } from "@/lib/routing-helpers";

export function MinimalTopbar(props: { cfg: BranchConfig; tenantSlug?: string }) {
    const { cfg } = props;
    const routingContext = useRoutingContext();
    const brandName = cfg.tenant.name || "Vendora"; // handles empty string (z.string() without .min(1))
    const branchBase = storefrontHref(routingContext, "/", { explicitBranchSlug: cfg.slug });
    const features = cfg.features;
    const menuEnabled = isMasterFeatureEnabled(features, "menu");
    const deliveryEnabled = isFeatureEnabled(features, "basicDelivery", "delivery");

    return (
        <div className="topbar">
            <div className="topbarInner">
                <a className="brand" href={branchBase} aria-label={brandName}>
                    <div className="logo" />
                    <div style={{ display: "grid" }}>
                        <div className="brandTitle">{brandName}</div>
                    </div>
                </a>

                <nav className="nav">
                    {menuEnabled && (
                        <a className="btn" href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: cfg.slug })}>
                            Catalog
                        </a>
                    )}
                    {deliveryEnabled && (
                        <a className="btn" href={storefrontHref(routingContext, "/delivery", { explicitBranchSlug: cfg.slug })}>
                            Delivery
                        </a>
                    )}
                </nav>
            </div>
        </div>
    );
}
