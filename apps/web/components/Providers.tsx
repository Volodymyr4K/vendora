"use client";

import React from "react";
import { CartProvider } from "./cart/CartProvider";
import { RoutingContextProvider } from "./RoutingContextProvider";
import type { RoutingContext } from "@/lib/routing-types";

export function Providers(props: {
  children: React.ReactNode;
  routingContext: RoutingContext;
}) {
  return (
    <RoutingContextProvider value={props.routingContext}>
      <CartProvider>{props.children}</CartProvider>
    </RoutingContextProvider>
  );
}
