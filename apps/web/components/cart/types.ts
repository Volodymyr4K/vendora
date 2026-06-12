export type CartItem = {
  id: string;
  title: string;
  priceSnapshot: number;
  qty: number;
};

export type CartState = {
  items: CartItem[];
};

export type CartApi = {
  items: CartItem[];
  count: number;
  add(item: Omit<CartItem, "qty">, qty?: number): void;
  setQty(id: string, qty: number): void;
  remove(id: string): void;
  clear(): void;
};
