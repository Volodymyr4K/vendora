import Link from "next/link";
import Image from "next/image";
import { MobileMenuTrigger } from "./MobileMenuTrigger";
import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";
import { AmCartPanel } from "./AmCartPanel";
import { AmHeaderSearch } from "./AmHeaderSearch";
import { AM_LOCALES } from "@/lib/am-locale";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { LanguageSwitcher } from "./LanguageSwitcher";
import { AmHeaderNav } from "./AmHeaderNav";
import { type AmContentV1, pickLocalized } from "@/lib/am-content";

function BrandLogo(props: { className?: string }) {
    return (
        <svg viewBox="0 0 100 100" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={props.className}>
            <rect x="20" y="20" width="60" height="60" stroke="currentColor" strokeWidth="2" fill="none" />
            <path d="M20 20 L80 80" stroke="currentColor" strokeWidth="1" />
            <path d="M80 20 L20 80" stroke="currentColor" strokeWidth="1" />
            <circle cx="50" cy="50" r="15" fill="currentColor" />
        </svg>
    );
}

export async function AmHeader({ tenantSlug, branchSlug, amContent }: { tenantSlug: string; branchSlug?: string; amContent?: AmContentV1 }) {
    const [routingContext, localeConfig] = await Promise.all([
        getRoutingContext(),
        getAmLocaleForTenant(tenantSlug),
    ]);
    const hrefFor = (path: string) => tenantHref(routingContext, path);
    const { locale, shouldPersist, cookieName, cookiePath } = localeConfig;
    const ui = amContent?.ui;
    const navUi = ui?.nav;
    const commonUi = ui?.common;
    const searchUi = ui?.search;
    const cartUi = ui?.cart;

    const headerNav = amContent?.header?.nav ?? [];
    const navItems = headerNav.map((item) => {
        const navFallback = navUi && item.id in navUi ? navUi[item.id as keyof typeof navUi] : undefined;
        return {
            label: pickLocalized(item.label, locale, pickLocalized(navFallback, locale, "")),
            href: hrefFor(item.href),
            matchPath: item.href,
        };
    });

    const cartLabels = {
        yourOrder: pickLocalized(cartUi?.yourOrder, locale, ""),
        empty: pickLocalized(cartUi?.empty, locale, ""),
        summary: pickLocalized(cartUi?.summary, locale, ""),
        total: pickLocalized(cartUi?.total, locale, ""),
        remove: pickLocalized(cartUi?.remove, locale, ""),
        itemNo: pickLocalized(cartUi?.itemNo, locale, ""),
    };
    const searchLabels = {
        search: pickLocalized(searchUi?.search, locale, ""),
        recentSearches: pickLocalized(searchUi?.recentSearches, locale, ""),
        clearHistory: pickLocalized(searchUi?.clearHistory, locale, ""),
        emptyArchive: pickLocalized(searchUi?.emptyArchive, locale, ""),
        trending: pickLocalized(searchUi?.trending, locale, ""),
        quickLinks: {
            philosophy: pickLocalized(searchUi?.quickLinks?.philosophy, locale, ""),
            art: pickLocalized(searchUi?.quickLinks?.art, locale, ""),
            newest: pickLocalized(searchUi?.quickLinks?.newest, locale, ""),
        },
    };

    const brandText = pickLocalized(amContent?.header?.brand?.text, locale, "");
    const brandLogoUrl = amContent?.header?.brand?.logoUrl;

    return (
        <header className="fixed top-0 left-0 w-full z-40 bg-transparent text-ink h-[60px] md:h-[80px] am-ink-header berlin-press-header-bottom adaptive">
            <div className="w-full h-full flex items-stretch berlin-press-header-row">
                <Link
                    href={hrefFor("/main")}
                    className="flex-1 md:flex-none md:w-[220px] bg-bg flex items-center justify-start px-4 md:px-7 group relative overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    aria-label="Berlin Press"
                >
                    <div className="absolute inset-0 bg-ink berlin-press-ink-noise translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out-quart" />
                    <div className="flex items-center gap-3 relative z-10 group-hover:text-paper transition-colors duration-500">
                        {brandLogoUrl ? (
                            <Image src={brandLogoUrl} alt={brandText} width={24} height={24} className="w-6 h-6 object-contain transition-transform duration-500 ease-out-quart group-hover:rotate-90" />
                        ) : (
                            <BrandLogo className="w-6 h-6 transition-transform duration-500 ease-out-quart group-hover:rotate-90" />
                        )}
                        <span className="md:hidden font-bold text-[10px] uppercase tracking-[0.3em] text-ink/80 group-hover:text-paper transition-colors duration-500">
                            <span className="sm:hidden">BERLIN PRESS</span>
                            <span className="hidden sm:inline">Berlin Press</span>
                        </span>
                        <span className="hidden md:block font-bold text-[10px] uppercase tracking-[0.3em] transition-transform duration-500 ease-out-quart group-hover:translate-x-1">
                            {brandText}
                        </span>
                    </div>
                </Link>

                <AmHeaderNav items={navItems} />

                <div className="hidden md:block lg:hidden flex-1 bg-bg" />

                <div className="flex items-stretch berlin-press-header-row">
                    <AmHeaderSearch catalogHref={hrefFor("/catalog")} labels={searchLabels} />

                    <div className="hidden lg:flex items-stretch">
                        <LanguageSwitcher
                            locales={AM_LOCALES}
                            activeLocale={locale}
                            shouldPersist={shouldPersist}
                            cookieName={cookieName}
                            cookiePath={cookiePath}
                        />
                    </div>

                    <div className="w-[80px] md:w-[130px] bg-bg flex items-center justify-center text-ink/80 transition-colors duration-500 ease-out group relative overflow-hidden">
                        <div className="absolute inset-0 bg-ink berlin-press-ink-noise translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out-quart" />
                        {branchSlug ? (
                            <AmCartPanel
                                branchSlug={branchSlug}
                                tenantSlug={tenantSlug}
                                labels={cartLabels}
                                className="relative z-10 transition-colors duration-500 group-hover:text-paper"
                            />
                        ) : null}
                    </div>

                    <MobileMenuTrigger
                        items={navItems}
                        closeLabel={pickLocalized(commonUi?.close, locale, "")}
                        locales={AM_LOCALES}
                        activeLocale={locale}
                        shouldPersist={shouldPersist}
                        cookieName={cookieName}
                        cookiePath={cookiePath}
                    />
                </div>
            </div>
        </header>
    );
}
