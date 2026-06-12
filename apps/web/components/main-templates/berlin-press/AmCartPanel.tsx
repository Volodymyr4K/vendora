"use client";

import React from "react";
import { useCart } from "@/components/cart/CartProvider";
import { AmCartButton } from "./AmCartButton";

type CartLabels = {
    yourOrder: string;
    empty: string;
    summary: string;
    total: string;
    remove: string;
    itemNo: string;
};

function IconClose(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
    );
}

export function AmCartPanel(props: {
    branchSlug: string;
    tenantSlug?: string;
    labels: CartLabels;
    className?: string;
    currencySymbol?: string;
}) {
    const { labels } = props;
    const cart = useCart();
    const [open, setOpen] = React.useState(false);
    const triggerRef = React.useRef<HTMLButtonElement | null>(null);
    const currency = props.currencySymbol ?? "€";

    const total = React.useMemo(() => {
        return cart.items.reduce((sum, item) => sum + item.priceSnapshot * item.qty, 0);
    }, [cart.items]);

    React.useEffect(() => {
        if (!open) return;
        const triggerEl = triggerRef.current;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") setOpen(false);
        };
        document.addEventListener("keydown", onKey);
        const prevOverflow = document.body.style.overflow;
        const prevPaddingRight = document.body.style.paddingRight;
        const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
        document.body.style.overflow = "hidden";
        if (scrollbarWidth > 0) {
            document.body.style.paddingRight = `${scrollbarWidth}px`;
        }
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = prevOverflow;
            document.body.style.paddingRight = prevPaddingRight;
            triggerEl?.focus();
        };
    }, [open]);

    return (
        <>
            <button
                ref={triggerRef}
                type="button"
                onClick={() => setOpen(true)}
                className={`w-full h-full flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg ${props.className ?? ""}`}
                aria-haspopup="dialog"
                aria-expanded={open}
                aria-label={labels.yourOrder}
            >
                <AmCartButton branchSlug={props.branchSlug} tenantSlug={props.tenantSlug} />
            </button>

            {open ? (
                <div className="fixed inset-0 z-50 flex justify-end font-mono text-ink">
                    <button
                        type="button"
                        className="absolute inset-0 bg-ink/40 backdrop-blur-sm berlin-press-cart-backdrop"
                        aria-label="Close cart"
                        onClick={() => setOpen(false)}
                    />

                    <div
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="am-cart-title"
                        className="relative w-full max-w-md bg-bg border-l border-line shadow-theme h-full flex flex-col berlin-press-cart-panel"
                    >
                        <div className="p-6 border-b border-line flex items-center justify-between bg-paper">
                            <h2 id="am-cart-title" className="text-sm md:text-base uppercase tracking-widest font-bold">
                                {labels.yourOrder}
                            </h2>
                            <button
                                type="button"
                                onClick={() => setOpen(false)}
                                className="hover:text-accent transition-colors"
                                aria-label="Close cart"
                            >
                                <IconClose className="w-5 h-5" />
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-6">
                            {cart.items.length === 0 ? (
                                <div className="text-center py-24 opacity-60 uppercase tracking-[0.25em] text-[11px]">
                                    [ {labels.empty} ]
                                </div>
                            ) : (
                                cart.items.map((item, index) => (
                                    <div
                                        key={item.id}
                                        className="border border-line bg-paper p-4 shadow-[4px_4px_0px_0px_rgba(17,18,20,0.08)]"
                                    >
                                        <div className="flex items-start justify-between gap-4">
                                            <div className="flex-1">
                                                <div className="flex items-start justify-between gap-4">
                                                    <h4 className="font-serif text-lg leading-tight">{item.title}</h4>
                                                    <span className="text-xs font-bold whitespace-nowrap">
                                                        {(item.priceSnapshot * item.qty).toFixed(2)} {currency}
                                                    </span>
                                                </div>
                                                <div className="mt-2 text-[10px] uppercase tracking-widest text-muted">
                                                    {labels.itemNo} {index + 1} / {item.id}
                                                </div>

                                                <div className="flex justify-between items-end mt-4">
                                                    <div className="flex border border-line h-8">
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                item.qty <= 1
                                                                    ? cart.remove(item.id)
                                                                    : cart.setQty(item.id, item.qty - 1)
                                                            }
                                                            className="px-2 hover:bg-ink hover:text-paper transition-colors"
                                                            aria-label={`Decrease quantity for ${item.title}`}
                                                        >
                                                            −
                                                        </button>
                                                        <span className="px-3 flex items-center bg-bg text-ink">{item.qty}</span>
                                                        <button
                                                            type="button"
                                                            onClick={() => cart.setQty(item.id, item.qty + 1)}
                                                            className="px-2 hover:bg-ink hover:text-paper transition-colors"
                                                            aria-label={`Increase quantity for ${item.title}`}
                                                        >
                                                            +
                                                        </button>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => cart.remove(item.id)}
                                                        className="text-xs uppercase underline hover:text-danger transition-colors"
                                                    >
                                                        {labels.remove}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>

                        {cart.items.length > 0 ? (
                            <div className="p-6 bg-paper border-t border-line">
                                <div className="space-y-2 text-[11px] uppercase tracking-widest">
                                    <div className="flex justify-between border-b border-dashed border-line pb-2">
                                        <span>{labels.summary}</span>
                                        <span>
                                            {total.toFixed(2)} {currency}
                                        </span>
                                    </div>
                                    <div className="flex justify-between font-bold text-base pt-2">
                                        <span>{labels.total}</span>
                                        <span>
                                            {total.toFixed(2)} {currency}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>
                </div>
            ) : null}
        </>
    );
}
