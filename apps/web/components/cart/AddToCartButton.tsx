"use client";

import React from "react";
import { useCart } from "./CartProvider";
import { getThemedButton } from "@/lib/components/button-registry";
import { useThemeOptional } from "@/lib/theme/client";

export function AddToCartButton(props: { id: string; title: string; price: number; tenantSlug?: string }) {
  const cart = useCart();
  const theme = useThemeOptional();
  const componentSet = theme?.componentSet ?? "default";

  const Button = getThemedButton({ componentSet, tenantOverrideKey: props.tenantSlug && props.tenantSlug.length > 0 ? props.tenantSlug : undefined });

  return (
    <Button
      variant="primary"
      onClick={() => cart.add({ id: props.id, title: props.title, priceSnapshot: props.price }, 1)}
      aria-label="Додати в кошик"
      type="button"
    >
      + У кошик
    </Button>
  );
}
