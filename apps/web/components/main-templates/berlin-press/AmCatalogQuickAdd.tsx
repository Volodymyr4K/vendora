"use client";

import React from "react";
import { useCart } from "@/components/cart/CartProvider";

function IconBag(props: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={props.className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
        >
            <path d="M6 2L3 6v13a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
            <line x1="3" y1="6" x2="21" y2="6" />
            <path d="M16 10a4 4 0 0 1-8 0" />
        </svg>
    );
}

export const AmCatalogQuickAdd = React.memo(function AmCatalogQuickAdd(props: { id: string; title: string; price: number; label: string }) {
    const cart = useCart();
    return (
        <button
            type="button"
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                cart.add({ id: props.id, title: props.title, priceSnapshot: props.price }, 1);
            }}
            className="w-full bg-ink text-paper py-3 flex items-center justify-center gap-2 text-[10px] uppercase font-bold tracking-widest hover:bg-accent transition-colors border-t border-paper/20"
            aria-label={props.label}
        >
            <IconBag className="w-3.5 h-3.5" />
            <span>{props.label}</span>
        </button>
    );
});

AmCatalogQuickAdd.displayName = "AmCatalogQuickAdd";
