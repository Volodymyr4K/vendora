"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import Link from "next/link";
import type { AmLocale } from "@/lib/am-locale";
import type { LocalizedValue } from "@/lib/am-content";
import { pickLocalized } from "@/lib/am-content";

type JournalItem = {
    id: string;
    href?: string;
    date?: LocalizedValue;
    title?: LocalizedValue;
};

type ToastMessage = {
    id: string;
    message: string;
    createdAt: number;
};

const TOAST_LIFETIME_MS = 5000;

function IconClose(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
            <path d="M6 6l12 12M18 6l-12 12" />
        </svg>
    );
}

function IconArrowRight(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M5 12h14M13 5l6 7-6 7" />
        </svg>
    );
}

function ToastItem({ toast, onRemove, closeLabel, notificationLabel }: { toast: ToastMessage; onRemove: (id: string) => void; closeLabel: string; notificationLabel: string }) {
    useEffect(() => {
        const timer = setTimeout(() => {
            onRemove(toast.id);
        }, TOAST_LIFETIME_MS);
        return () => clearTimeout(timer);
    }, [onRemove, toast.id]);

    const timeLabel = useMemo(() => {
        return new Date(toast.createdAt).toLocaleTimeString("en-GB", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
        });
    }, [toast.createdAt]);

    return (
        <div className="pointer-events-auto min-w-[300px] max-w-[420px] border border-ink/80 animate-berlin-press-toast-in bg-paper text-ink flex flex-col">
            <div className="p-5 flex items-start gap-4">
                <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                        <span className="text-[10px] uppercase font-bold tracking-widest text-ink">{notificationLabel}</span>
                        <span className="h-[1px] flex-1 bg-ink/20" />
                    </div>
                    <p className="font-mono text-xs leading-relaxed uppercase">{toast.message}</p>
                </div>
                <button
                    type="button"
                    onClick={() => onRemove(toast.id)}
                    className="group p-1 hover:bg-ink/5 transition-colors"
                    aria-label={closeLabel}
                >
                    <IconClose className="h-3.5 w-3.5" />
                </button>
            </div>
            <div className="px-5 pb-3 flex justify-between items-center opacity-40">
                <span className="text-[8px] font-mono">{timeLabel}</span>
                <IconArrowRight className="h-2.5 w-2.5" />
            </div>
        </div>
    );
}

function ToastContainer({ toasts, removeToast, closeLabel, notificationLabel }: { toasts: ToastMessage[]; removeToast: (id: string) => void; closeLabel: string; notificationLabel: string }) {
    if (toasts.length === 0) return null;
    return (
        <div className="fixed bottom-0 right-0 z-[100] flex flex-col items-end p-6 gap-2 pointer-events-none">
            {toasts.map((toast) => (
                <ToastItem key={toast.id} toast={toast} onRemove={removeToast} closeLabel={closeLabel} notificationLabel={notificationLabel} />
            ))}
        </div>
    );
}

export function JournalArchiveList({
    items,
    locale,
    href,
    archiveToast,
    notificationLabel,
    closeLabel,
}: {
    items: JournalItem[];
    locale: AmLocale;
    href: string;
    archiveToast?: LocalizedValue | string;
    notificationLabel: string;
    closeLabel: string;
}) {
    const [toasts, setToasts] = useState<ToastMessage[]>([]);
    const toastMessage = useMemo(() => pickLocalized(archiveToast, locale, ""), [archiveToast, locale]);

    const showToast = useCallback((message: string) => {
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`;
        setToasts((prev) => [...prev, { id, message, createdAt: Date.now() }]);
    }, []);

    const removeToast = useCallback((id: string) => {
        setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, []);

    const handleClick = useCallback(
        (event: MouseEvent<HTMLAnchorElement>) => {
            if (toastMessage.trim().length === 0) return;
            event.preventDefault();
            showToast(toastMessage);
        },
        [showToast, toastMessage]
    );

    return (
        <>
            <section className="bg-paper">
                {items.map((n, idx) => (
                    <Link key={n.id} className="block w-full text-left group" href={n.href ?? href} prefetch={false} onClick={handleClick}>
                        <div className="border-b border-line p-8 md:p-12 flex flex-col md:flex-row items-baseline gap-6 hover:bg-ink hover:text-paper transition-colors duration-500 ease-out berlin-press-ink-hover">
                            <span className="font-mono text-xs w-32 shrink-0">
                                0{idx + 1} / {pickLocalized(n.date, locale, "")}
                            </span>
                            <div className="flex-1">
                                <h3 className="text-4xl md:text-6xl font-serif mb-2 transition-all duration-300">
                                    {pickLocalized(n.title, locale, "")}
                                </h3>
                            </div>
                            <IconArrowRight className="hidden md:block w-5 h-5 transform group-hover:translate-x-4 transition-transform duration-500 ease-out-quart" />
                        </div>
                    </Link>
                ))}
            </section>
            <ToastContainer toasts={toasts} removeToast={removeToast} closeLabel={closeLabel} notificationLabel={notificationLabel} />
        </>
    );
}
