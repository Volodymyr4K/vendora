"use client";

import React from "react";
import { useCart } from "./CartProvider";
import { useThemeOptional } from "@/lib/theme/client";
import { getThemedBadge } from "@/lib/components/badge-registry";
import { useRoutingContext } from "@/components/RoutingContextProvider";
import { storefrontHref } from "@/lib/routing-helpers";

export function CartLink(props: { branchSlug: string; tenantSlug?: string }) {
  const cart = useCart();
  const theme = useThemeOptional();
  const routingContext = useRoutingContext();
  const componentSet = theme?.componentSet ?? "default";
  const Badge = getThemedBadge({ componentSet, tenantOverrideKey: props.tenantSlug });
  return (
    <a
      className="btn"
      href={storefrontHref(routingContext, "/checkout", { explicitBranchSlug: props.branchSlug })}
      aria-label="Go to cart"
    >
      🧺 Cart <Badge>{cart.count}</Badge>
    </a>
  );
}
