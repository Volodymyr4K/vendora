"use client";

import React from "react";
import type { CartApi as BaseCartApi, CartItem, CartState } from "./types";

interface CartApi extends BaseCartApi {
  setItems(items: CartItem[]): void;
}

const LS_KEY = "vendora_cart_v1";

const CartCtx = React.createContext<CartApi | null>(null);

function clampQty(q: number) {
  if (!Number.isFinite(q)) return 1;
  return Math.max(1, Math.min(99, Math.floor(q)));
}

function load(): CartState {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return { items: [] };
    const obj = JSON.parse(raw);
    if (!obj || !Array.isArray(obj.items)) return { items: [] };
    const items: CartItem[] = obj.items
      .map((x: unknown) => {
        const i = x as Record<string, unknown>;
        return {
          id: String(i.id || ""),
          title: String(i.title || ""),
          priceSnapshot: Number(i.priceSnapshot || 0),
          qty: clampQty(Number(i.qty || 1)),
        };
      })
      .filter((x: CartItem) => x.id && x.title);
    return { items };
  } catch {
    return { items: [] };
  }
}

function save(state: CartState) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

export function CartProvider(props: { children: React.ReactNode }) {
  const [state, setState] = React.useState<CartState>({ items: [] });

  React.useEffect(() => {
    setState(load());
  }, []);

  const api: CartApi = React.useMemo(() => {
    const items = state.items;
    const count = items.reduce((acc, x) => acc + (x.qty || 0), 0);

    return {
      items,
      count,
      add(item, qty = 1) {
        const q = clampQty(qty);
        setState((prev) => {
          const exists = prev.items.find((x) => x.id === item.id);
          const nextItems = exists
            ? prev.items.map((x) => (x.id === item.id ? { ...x, qty: clampQty(x.qty + q) } : x))
            : [...prev.items, { ...item, qty: q }];
          const next = { items: nextItems };
          save(next);
          return next;
        });
      },
      setQty(id, qty) {
        const q = clampQty(qty);
        setState((prev) => {
          const nextItems = prev.items.map((x) => (x.id === id ? { ...x, qty: q } : x));
          const next = { items: nextItems };
          save(next);
          return next;
        });
      },
      remove(id) {
        setState((prev) => {
          const next = { items: prev.items.filter((x) => x.id !== id) };
          save(next);
          return next;
        });
      },
      clear() {
        const next = { items: [] };
        setState(next);
        save(next);
      },
      setItems(newItems) {
        // Bulk replace (used for Re-order)
        const next = { items: newItems };
        setState(next);
        save(next);
      }
    };
  }, [state]);

  return <CartCtx.Provider value={api}>{props.children}</CartCtx.Provider>;
}

export function useCart() {
  const v = React.useContext(CartCtx);
  if (!v) throw new Error("CartProvider missing");
  return v;
}
