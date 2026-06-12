import Link from "next/link";
import Image from "next/image";
import dynamic from "next/dynamic";
import { memo } from "react";
import { ProductCard } from "./ProductCard";
import type { MenuResponse } from "@vendora/contracts";
import type { AmLocale } from "@/lib/am-locale";
import { type AmContentV1, pickLocalized, pickLocalizedNoFallback, pickLocalizedOptional } from "@/lib/am-content";
import { storefrontHref, tenantHref } from "@/lib/routing-helpers";
import type { RoutingContext } from "@/lib/routing-types";

const JournalArchiveList = dynamic(
    () => import("./JournalArchiveList").then((mod) => mod.JournalArchiveList),
    { ssr: true }
);

type MenuItem = MenuResponse["items"][number];

const MemoProductCard = memo(ProductCard);

function IconStar(props: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={props.className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M12 3l2.6 5.3 5.9.9-4.2 4.1 1 5.9L12 16.8 6.7 19.2l1-5.9-4.2-4.1 5.9-.9L12 3z" />
        </svg>
    );
}

function IconGlobe(props: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={props.className}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            aria-hidden="true"
            focusable="false"
        >
            <circle cx="12" cy="12" r="9" />
            <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
        </svg>
    );
}

type Props = {
    tenantSlug: string;
    branchSlug?: string;
    items: MenuItem[];
    journalItems?: Array<{ id: string; href?: string; date?: import("@/lib/am-content").LocalizedValue; title?: import("@/lib/am-content").LocalizedValue }>;
    locale: AmLocale;
    amContent?: AmContentV1;
    routingContext: RoutingContext;
};

export function HomePage({ tenantSlug, branchSlug, items, journalItems, locale, amContent, routingContext }: Props) {
    const newBooks = items.filter((item) => (item.tags ?? []).some((tag) => tag.trim().toLowerCase() === "new")).slice(0, 4);
    const displayBooks = newBooks.length > 0 ? newBooks : items.slice(0, 4);
    const marqueeBase = pickLocalized(amContent?.homepage?.marqueeVertical, locale, "");
    const marqueeContent = Array(20).fill(marqueeBase);
    const tickerItems = amContent?.homepage?.ticker?.map((item) => pickLocalized(item.text, locale, "")) ?? [];
    // Ensure the marquee track is long enough, then duplicate for seamless loop.
    const tickerLoop = Array.from({ length: 12 }, () => tickerItems).flat();
    const heroTitle = pickLocalized(
        amContent?.homepage?.hero?.title,
        locale,
        ""
    );
    const heroLines = heroTitle.split(/\n+/).filter(Boolean);
    const heroEyebrow = pickLocalizedOptional(amContent?.homepage?.hero?.eyebrow, locale);
    const heroSubtitle = pickLocalized(amContent?.homepage?.hero?.subtitle, locale, "");
    const heroCtaText = pickLocalized(amContent?.homepage?.hero?.ctaText, locale, "");
    const heroCtaHref = amContent?.homepage?.hero?.ctaHref;
    const heroImageUrl = amContent?.homepage?.hero?.imageUrl;
    const heroImageAlt = pickLocalized(amContent?.homepage?.hero?.imageAlt, locale, "");
    const featuredLabel = pickLocalized(
        amContent?.homepage?.featured?.label,
        locale,
        ""
    );
    const featuredTitle = pickLocalized(
        amContent?.homepage?.featured?.title,
        locale,
        ""
    );
    const stats = amContent?.homepage?.stats ?? [];
    const editorialTitle = pickLocalized(amContent?.homepage?.editorialTitle, locale, "");
    const editorialParts = editorialTitle.includes("\n") ? editorialTitle.split(/\n+/) : editorialTitle.split(" ");
    const editorialLine1 = editorialParts[0] ?? editorialTitle;
    const editorialLine2 = editorialParts.slice(1).join(" ");
    const editorialDesc = pickLocalized(amContent?.homepage?.editorialDesc, locale, "");
    const editorialImageUrl = amContent?.homepage?.editorialImageUrl;
    const editorialImageAlt = pickLocalized(amContent?.homepage?.editorialImageAlt, locale, "");
    const newArrivalsTitle = pickLocalizedNoFallback(
        amContent?.homepage?.newArrivalsTitle,
        locale,
        ""
    );
    const newArrivalsHeadingEnabled = amContent?.homepage?.newArrivalsHeadingEnabled !== false;
    const showNewArrivalsHeading = newArrivalsHeadingEnabled && newArrivalsTitle.trim().length > 0;
    const viewAllLabel = pickLocalizedNoFallback(amContent?.homepage?.viewAllLabel, locale, "");
    const viewAllHrefSafe = amContent?.homepage?.viewAllHref ?? "";
    const viewAllEnabled = amContent?.homepage?.viewAllLinkEnabled !== false;
    const showViewAllLink = viewAllEnabled && viewAllHrefSafe.length > 0 && viewAllLabel.trim().length > 0;
    const commonUi = amContent?.ui?.common;
    const notificationLabel = pickLocalized(commonUi?.notificationLabel, locale, "");
    const closeLabel = pickLocalized(commonUi?.close, locale, "");
    const hrefFor = (suffix: string) => {
        if (routingContext?.tenantSlug) {
            return tenantHref(routingContext, suffix);
        }
        const safe = suffix.startsWith("/") ? suffix : `/${suffix}`;
        return `/t/${tenantSlug}${safe}`;
    };
    const journalHref = hrefFor("/journal");
    const fallbackCatalogHref = hrefFor("/catalog");
    const productHref = (id: string) => {
        if (routingContext) {
            return storefrontHref(routingContext, `/p/${id}`, { explicitBranchSlug: branchSlug });
        }
        if (branchSlug) return `/t/${tenantSlug}/${branchSlug}/p/${id}`;
        return fallbackCatalogHref;
    };

    return (
        <div className="bg-bg min-h-screen pt-[60px] md:pt-[80px]">
            {/* 1. HERO - BRUTAL TYPOGRAPHY */}
            <section className="border-b border-line relative overflow-hidden">
                <div className="grid grid-cols-1 lg:grid-cols-12 min-h-[85vh]">
                    {/* Left: Text */}
                    <div className="lg:col-span-8 p-6 md:p-12 flex flex-col justify-between border-b lg:border-b-0 relative">
                        <div className="flex justify-between items-start animate-fade-in gpu-accelerated">
                            {heroEyebrow ? (
                                <span className="font-mono text-xs uppercase border border-line px-2 py-1 rounded-none">
                                    {heroEyebrow}
                                </span>
                            ) : null}
                            <IconStar className="text-ink animate-spin-slow w-10 h-10" />
                        </div>

                        <div className="z-10 mt-12 md:mt-0 overflow-hidden">
                            <h1 className="text-6xl md:text-8xl lg:text-[8vw] xl:text-[7vw] leading-[0.85] font-serif text-ink uppercase mix-blend-darken break-words hyphens-auto">
                                {heroLines.map((line, idx) => (
                                    <div key={idx} className={`animate-fade-up gpu-accelerated${idx === 1 ? " delay-200" : ""}`}>
                                        {line}
                                    </div>
                                ))}
                            </h1>
                        </div>

                        <div className="flex flex-col md:flex-row gap-8 items-start md:items-end justify-between mt-12 animate-fade-up delay-300 gpu-accelerated">
                            <p className="max-w-xs text-sm font-mono leading-tight">{heroSubtitle}</p>
                            {heroCtaHref && heroCtaText ? (
                                <Link
                                    href={hrefFor(heroCtaHref)}
                                    className="bg-ink text-paper px-10 py-4 text-xs font-bold uppercase tracking-[0.2em] hover:bg-accent hover:text-ink transition-colors border border-transparent hover:border-line duration-500"
                                >
                                    {heroCtaText}
                                </Link>
                            ) : null}
                        </div>
                    </div>

                    {/* Right: Visual */}
                    <div className="lg:col-span-4 bg-ink relative group overflow-hidden min-h-[300px] lg:min-h-auto">
                        <div className="relative w-full h-full overflow-hidden">
                            {heroImageUrl ? (
                                <Image
                                    src={heroImageUrl}
                                    alt={heroImageAlt}
                                    fill
                                    priority
                                    fetchPriority="high"
                                    sizes="(min-width: 1024px) 33vw, 100vw"
                                    className="object-cover opacity-60 grayscale group-hover:grayscale-0 transition-all duration-[2000ms] ease-out-quart mix-blend-luminosity group-hover:scale-105 gpu-accelerated"
                                />
                            ) : null}
                        </div>
                        {/* Vertical Marquee */}
                        <div className="absolute inset-y-0 right-0 w-12 border-l border-line/20 overflow-hidden flex justify-center py-4 bg-ink/20 backdrop-blur-sm">
                            <div
                                className="writing-vertical text-xs font-mono text-paper animate-marquee uppercase tracking-widest whitespace-nowrap gpu-accelerated"
                                style={{ height: "200%" }}
                            >
                                {marqueeContent.join("")}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            {/* 2. TICKER TAPE (Horizontal) */}
            <div className="bg-accent text-ink py-3 -mt-px overflow-hidden shadow-[inset_0_-3px_0_0_var(--line),inset_0_3px_0_0_var(--line)]">
                <div className="flex whitespace-nowrap animate-marquee gpu-accelerated w-max">
                    {tickerLoop.flatMap((text, i) => [
                        <span key={`t-${i}`} className="px-2 text-2xl font-serif italic">
                            {text}
                        </span>,
                        <span key={`d-${i}`} className="px-2 text-2xl font-serif italic" aria-hidden="true">
                            •
                        </span>,
                    ])}
                </div>
            </div>

            {/* 3. CATALOG GRID */}
            <section>
                <div className="grid grid-cols-1 lg:grid-cols-12">
                    {/* Sidebar Title */}
                    {showNewArrivalsHeading ? (
                        <div className="hidden lg:flex lg:col-span-1 border-r border-line items-center justify-center py-12 lg:py-0 bg-paper">
                            <h2 className="lg:-rotate-90 text-xl sm:text-2xl font-bold uppercase tracking-[0.2em] lg:tracking-[0.3em] whitespace-normal lg:whitespace-nowrap text-center px-6 lg:px-0">
                                {newArrivalsTitle}
                            </h2>
                        </div>
                    ) : null}

                    {/* Products */}
                    <div className="lg:col-span-11">
                        {showNewArrivalsHeading ? (
                            <div className="lg:hidden border-b border-line px-6 py-10 bg-paper">
                                <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-center">
                                    {newArrivalsTitle}
                                </h2>
                            </div>
                        ) : null}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 border-b border-line">
                            {displayBooks.map((item) => (
                                <MemoProductCard key={item.id} item={item} locale={locale} href={productHref(item.id)} ui={amContent?.ui} />
                            ))}
                        </div>
                        <div className="border-b border-line p-4 flex justify-end">
                            {showViewAllLink ? (
                                <Link
                                    href={hrefFor(viewAllHrefSafe)}
                                    className="text-xs font-mono uppercase underline hover:text-accent transition-colors duration-300"
                                >
                                    {viewAllLabel} &rarr;
                                </Link>
                            ) : null}
                        </div>
                    </div>
                </div>
            </section>

            {/* 4. EDITORIAL / CONCEPT */}
            <section className="grid grid-cols-1 md:grid-cols-2 min-h-[600px] border-b border-line">
                <div className="p-12 md:p-20 flex flex-col justify-center bg-bg">
                    <IconGlobe className="mb-12 text-ink animate-spin-slow w-16 h-16" />
                    <h2 className="text-6xl md:text-8xl font-serif leading-[0.8] mb-8">
                        {editorialLine1} {editorialLine2 ? <br /> : null} {editorialLine2}
                    </h2>
                    <p className="font-mono text-sm max-w-md mb-12">{editorialDesc}</p>
                    <div className="w-full flex border border-line divide-x divide-line">
                        <div className="flex-1 py-4 text-center flex flex-col items-center justify-center">
                            <span className="block text-3xl font-bold">{stats[0]?.value ?? ""}</span>
                            <span className="text-[9px] uppercase">
                                {pickLocalized(stats[0]?.label, locale, "")}
                            </span>
                        </div>
                        <div className="flex-1 py-4 text-center flex flex-col items-center justify-center">
                            <span className="block text-3xl font-bold">{stats[1]?.value ?? ""}</span>
                            <span className="text-[9px] uppercase">
                                {pickLocalized(stats[1]?.label, locale, "")}
                            </span>
                        </div>
                    </div>
                </div>
                <div className="relative group overflow-hidden border-x border-line">
                    <div className="relative w-full h-full min-h-[360px] overflow-hidden">
                        {editorialImageUrl ? (
                            <>
                                <Image
                                    src={editorialImageUrl}
                                    alt={editorialImageAlt}
                                    fill
                                    sizes="(min-width: 768px) 50vw, 100vw"
                                    className="object-cover grayscale contrast-125 group-hover:scale-105 transition-transform duration-[2000ms] ease-out-quart gpu-accelerated"
                                />
                                <div className="absolute inset-0 bg-ink/20 mix-blend-multiply transition-opacity duration-700 group-hover:opacity-0"></div>
                            </>
                        ) : null}
                    </div>
                    <div className="absolute bottom-0 left-0 bg-paper border-t border-r border-line p-6 transition-transform duration-700 ease-out-quart group-hover:-translate-y-2">
                        <span className="font-mono text-xs block mb-2">{featuredLabel}</span>
                        <span className="font-serif text-2xl">{featuredTitle}</span>
                    </div>
                </div>
            </section>

            {/* 5. JOURNAL LIST */}
            <JournalArchiveList
                items={journalItems ?? (amContent?.journal?.items ?? [])}
                locale={locale}
                href={journalHref}
                archiveToast={journalItems ? "" : amContent?.journal?.archiveToast}
                notificationLabel={notificationLabel}
                closeLabel={closeLabel}
            />
        </div>
    );
}
