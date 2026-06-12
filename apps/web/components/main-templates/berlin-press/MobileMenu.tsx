"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { AmLocale } from "@/lib/am-locale";

type NavItem = {
    label: string;
    href: string;
};

export function MobileMenu({
    id,
    open,
    onClose,
    items,
    closeLabel,
    locales,
    activeLocale,
    shouldPersist,
    cookieName,
    cookiePath,
}: {
    id: string;
    open: boolean;
    onClose: () => void;
    items: NavItem[];
    closeLabel: string;
    locales: readonly AmLocale[];
    activeLocale: AmLocale;
    shouldPersist: boolean;
    cookieName: string;
    cookiePath: string;
}) {
    const router = useRouter();
    const closeButtonRef = useRef<HTMLButtonElement | null>(null);

    useEffect(() => {
        if (!open) return;
        function onKey(e: KeyboardEvent) {
            if (e.key === "Escape") onClose();
        }
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [open, onClose]);

    useEffect(() => {
        if (!open) return;
        const prevOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = prevOverflow;
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        closeButtonRef.current?.focus();
    }, [open]);

    if (!open) return null;

    return (
        <div
            id={id}
            role="dialog"
            aria-modal="true"
            aria-label="Menu"
            className="fixed inset-0 z-50 text-paper"
        >
            <button
                type="button"
                aria-label="Close menu"
                onClick={onClose}
                className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
            />
            <div className="fixed top-0 bottom-0 right-0 w-full sm:w-[88vw] max-w-[460px] bg-ink berlin-press-ink-noise flex flex-col shadow-2xl">
                <div className="h-[60px] border-b border-paper/20 flex justify-end items-center px-4">
                    <button
                        ref={closeButtonRef}
                        type="button"
                        onClick={onClose}
                        className="flex items-center gap-2 text-xs uppercase tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/70 focus-visible:ring-offset-2 focus-visible:ring-offset-ink"
                    >
                        {closeLabel}
                        <span className="text-lg">×</span>
                    </button>
                </div>

                <nav className="flex-1 flex flex-col px-6 overflow-y-auto">
                    {items.map((item, i) => (
                        <Link
                            key={item.label}
                            href={item.href}
                            onClick={onClose}
                            className="text-4xl sm:text-5xl font-serif py-6 border-b border-paper/10 hover:pl-6 transition-all duration-700 ease-out-quart flex justify-between items-center group"
                            style={{ animationDelay: `${i * 100}ms` }}
                        >
                            {item.label}
                            <span className="text-xs font-mono opacity-0 group-hover:opacity-100 text-accent transition-opacity duration-700">
                                0{i + 1}
                            </span>
                        </Link>
                    ))}
                </nav>

                <div className="border-t border-paper/20 grid grid-cols-3">
                    {locales.map((lang) => {
                        const isActive = lang === activeLocale;
                        return (
                            <button
                                key={lang}
                                type="button"
                                onClick={() => {
                                    const cookie = shouldPersist
                                        ? `${cookieName}=${lang}; path=${cookiePath}; max-age=31536000`
                                        : `${cookieName}=${lang}; path=${cookiePath}`;
                                    document.cookie = cookie;
                                    router.refresh();
                                    onClose();
                                }}
                                className={`h-[56px] text-[10px] font-mono tracking-[0.32em] uppercase transition-colors ${
                                    isActive
                                        ? "bg-paper text-ink"
                                        : "text-paper/70 hover:bg-paper/10 hover:text-paper"
                                }`}
                                aria-pressed={isActive}
                            >
                                {lang}
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
