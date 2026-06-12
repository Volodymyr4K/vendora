"use client";

import React, { createContext, useContext } from "react";
import type { RoutingContext } from "@/lib/routing-types";

const RoutingContextValue = createContext<RoutingContext | null>(null);

export function RoutingContextProvider({
  value,
  children,
}: {
  value: RoutingContext;
  children: React.ReactNode;
}) {
  return (
    <RoutingContextValue.Provider value={value}>
      {children}
    </RoutingContextValue.Provider>
  );
}

export function useRoutingContext(): RoutingContext {
  const ctx = useContext(RoutingContextValue);
  if (!ctx) {
    return { kind: "path", mode: "chooser" };
  }
  return ctx;
}
