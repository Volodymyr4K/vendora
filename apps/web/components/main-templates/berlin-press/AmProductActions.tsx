"use client";

import { useState } from "react";
import { useCart } from "@/components/cart/CartProvider";

type Props = {
    id: string;
    title: string;
    price: number;
    isAvailable: boolean;
    labels: {
        total: string;
        addToCart: string;
        outOfStock: string;
    };
};

export function AmProductActions({ id, title, price, isAvailable, labels }: Props) {
    const cart = useCart();
    const [qty, setQty] = useState(1);

    return (
        <div className="border-t border-line bg-bg p-6 md:p-8 sticky bottom-0 z-10 pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
            <div className="flex flex-col gap-4">
                <div className="flex justify-between items-baseline">
                    <span className="font-mono text-xs uppercase">{labels.total}</span>
                    <span className="text-4xl font-serif">{price.toFixed(2)} €</span>
                </div>

                <div className="flex border border-line bg-paper h-14">
                    <button
                        type="button"
                        onClick={() => setQty((q) => Math.max(1, q - 1))}
                        className="w-14 border-r border-line hover:bg-ink hover:text-paper flex items-center justify-center transition-colors"
                        aria-label="Decrease quantity"
                    >
                        −
                    </button>
                    <div className="flex-1 flex items-center justify-center font-mono text-lg border-r border-line">
                        {qty}
                    </div>
                    <button
                        type="button"
                        onClick={() => setQty((q) => q + 1)}
                        className="w-14 border-r border-line hover:bg-ink hover:text-paper flex items-center justify-center transition-colors"
                        aria-label="Increase quantity"
                    >
                        +
                    </button>
                    <button
                        type="button"
                        onClick={() => cart.add({ id, title, priceSnapshot: price }, qty)}
                        className="flex-[2] bg-ink text-paper hover:bg-accent transition-colors uppercase font-bold text-sm tracking-[0.2em] disabled:bg-muted disabled:cursor-not-allowed"
                        disabled={!isAvailable}
                    >
                        {isAvailable ? labels.addToCart : labels.outOfStock}
                    </button>
                </div>
            </div>
        </div>
    );
}
