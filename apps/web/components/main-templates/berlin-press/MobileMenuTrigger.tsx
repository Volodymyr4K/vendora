"use client";

import React from "react";
import { MobileMenu } from "./MobileMenu";
import type { AmLocale } from "@/lib/am-locale";

type NavItem = {
    label: string;
    href: string;
};

function IconMenu(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" />
        </svg>
    );
}

export function MobileMenuTrigger(props: {
    items: NavItem[];
    closeLabel: string;
    locales: readonly AmLocale[];
    activeLocale: AmLocale;
    shouldPersist: boolean;
    cookieName: string;
    cookiePath: string;
}) {
    const [open, setOpen] = React.useState(false);
    const menuId = React.useId();
    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="lg:hidden w-[60px] flex items-center justify-center bg-ink text-paper berlin-press-ink-noise"
                aria-label="Open menu"
                aria-expanded={open}
                aria-controls={menuId}
            >
                <IconMenu className="w-5 h-5" />
            </button>
            <MobileMenu
                id={menuId}
                open={open}
                onClose={() => setOpen(false)}
                items={props.items}
                closeLabel={props.closeLabel}
                locales={props.locales}
                activeLocale={props.activeLocale}
                shouldPersist={props.shouldPersist}
                cookieName={props.cookieName}
                cookiePath={props.cookiePath}
            />
        </>
    );
}
