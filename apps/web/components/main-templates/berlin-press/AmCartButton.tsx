"use client";

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

export function AmCartButton(props: { branchSlug: string; tenantSlug?: string; className?: string }) {
    const cart = useCart();
    void props;
    return (
        <div className={`flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest ${props.className ?? ""}`}>
            <span>({cart.count})</span>
            <IconBag className="w-4 h-4" />
        </div>
    );
}
