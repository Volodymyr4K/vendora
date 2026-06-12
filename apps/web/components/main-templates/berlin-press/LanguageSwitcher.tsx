"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import type { AmLocale } from "@/lib/am-locale";

type Props = {
    locales: readonly AmLocale[];
    activeLocale: AmLocale;
    shouldPersist: boolean;
    cookieName: string;
    cookiePath: string;
};

export function LanguageSwitcher({ locales, activeLocale, shouldPersist, cookieName, cookiePath }: Props) {
    const router = useRouter();

    useEffect(() => {
        if (!shouldPersist) return;
        document.cookie = `${cookieName}=${activeLocale}; path=${cookiePath}; max-age=31536000`;
    }, [activeLocale, shouldPersist, cookieName, cookiePath]);

    return (
        <div className="hidden md:flex flex-col w-[64px] bg-bg text-[9px] font-mono tracking-[0.32em] text-ink/70">
            {locales.map((lang) => {
                const isActive = lang === activeLocale;
                return (
                    <button
                        key={lang}
                        type="button"
                        onClick={() => {
                            document.cookie = `${cookieName}=${lang}; path=${cookiePath}; max-age=31536000`;
                            router.refresh();
                        }}
                        className={`flex-1 flex items-center justify-center uppercase transition-colors ${
                            isActive
                                ? "bg-ink text-paper berlin-press-ink-noise"
                                : "text-ink/70 hover:bg-ink hover:text-paper berlin-press-ink-hover"
                        }`}
                        aria-pressed={isActive}
                    >
                        {lang}
                    </button>
                );
            })}
        </div>
    );
}
