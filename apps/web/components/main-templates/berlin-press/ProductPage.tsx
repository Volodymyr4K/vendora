import Image from "next/image";
import Link from "next/link";
import type { MenuResponse } from "@vendora/contracts";
import type { RoutingContext } from "@/lib/routing-types";
import type { AmLocale } from "@/lib/am-locale";
import { storefrontHref, tenantHref } from "@/lib/routing-helpers";
import { AmProductActions } from "./AmProductActions";
import { AmFullBleed } from "./FullBleed";
import { AmHeader } from "./Header";
import { AmFooter } from "./Footer";
import { type AmContentV1, pickLocalized } from "@/lib/am-content";

type MenuItem = MenuResponse["items"][number];

function isYearLike(value: number | null | undefined): value is number {
    return typeof value === "number" && value >= 1900 && value <= 2100;
}

function getReleaseYear(item: MenuItem) {
    const tags = item.tags ?? [];
    for (const raw of tags) {
        const tag = raw.trim();
        if (/^(19|20)\d{2}$/.test(tag)) return Number.parseInt(tag, 10);
        const match = tag.match(/^(?:year|yr)\s*[:=]\s*(\d{4})$/i);
        if (match) return Number.parseInt(match[1] ?? "", 10);
    }
    if (isYearLike(item.weightG)) return Math.round(item.weightG);
    return null;
}

function getPagesCount(item: MenuItem) {
    const tags = item.tags ?? [];
    for (const raw of tags) {
        const tag = raw.trim().toLowerCase();
        const prefixMatch = tag.match(/^(?:pages?|pp|pg|p)\s*[:=]?\s*(\d{2,4})$/);
        if (prefixMatch) return Number.parseInt(prefixMatch[1] ?? "", 10);
        const suffixMatch = tag.match(/^(\d{2,4})\s*(?:pages?|pp|pg|p)$/);
        if (suffixMatch) return Number.parseInt(suffixMatch[1] ?? "", 10);
    }
    return null;
}

type Props = {
    tenantSlug: string;
    branchSlug: string;
    item: MenuItem;
    categoryTitle: string;
    relatedItems: MenuItem[];
    routingContext: RoutingContext;
    locale: AmLocale;
    amContent?: AmContentV1;
};

function RelatedCard({
    item,
    href,
    noImageLabel,
}: {
    item: MenuItem;
    href: string;
    noImageLabel: string;
}) {
    const meta = item.slug || item.id;
    const tag = item.tags?.[0];
    return (
        <Link
            href={href}
            prefetch={false}
            className="group relative block h-full w-full bg-paper border-r border-b border-line transition-all duration-300"
        >
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center px-4 py-3 border-b border-line bg-paper text-[9px] font-mono uppercase tracking-[0.25em] text-muted">
                    <div className="flex gap-3 items-center">
                        <span className="text-ink font-bold tracking-[0.2em]">{meta}</span>
                    </div>
                    {tag ? <span className="text-muted">{tag}</span> : null}
                </div>
                <div className="relative w-full aspect-[3/4] border-b border-line overflow-hidden bg-bg">
                    {item.imageUrl ? (
                        <Image
                            src={item.imageUrl}
                            alt={item.imageAlt || item.title}
                            fill
                            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                            className="object-cover grayscale group-hover:grayscale-0 transition-all duration-[1000ms] ease-out-quart"
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-bg text-muted text-xs font-mono uppercase tracking-widest">
                            {noImageLabel}
                        </div>
                    )}
                </div>
                <div className="p-5 flex flex-col gap-3 bg-paper">
                    <h3 className="text-xl font-serif leading-[1.05] group-hover:text-accent transition-colors">
                        {item.title}
                    </h3>
                    <div className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
                        {item.categorySlug}
                    </div>
                    <div className="pt-2 border-t border-line/40 flex items-end justify-between">
                        <div className="font-serif text-[18px] text-ink">{item.price.toFixed(2)} €</div>
                        <div className="w-7 h-7 rounded-full border border-line flex items-center justify-center group-hover:bg-ink group-hover:border-ink transition-all duration-300">
                            <svg viewBox="0 0 24 24" className="h-3 w-3 text-muted group-hover:text-paper transition-colors" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M7 17L17 7M8 7h9v9" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}

export function AmProductPage({
    tenantSlug,
    branchSlug,
    item,
    categoryTitle,
    relatedItems,
    routingContext,
    locale,
    amContent,
}: Props) {
    const ui = amContent?.ui;
    const productUi = ui?.product;
    const commonUi = ui?.common;
    const cartUi = ui?.cart;
    const figLabel = item.slug || item.id;
    const metaIsbn = item.slug || item.id;
    const detailYear = getReleaseYear(item);
    const detailPages = getPagesCount(item);
    const authorLine = item.tags?.find((t) => t.toLowerCase().startsWith("by "))?.replace(/^by\s+/i, "");
    const backHref = tenantHref(routingContext, "/catalog");
    const noImageLabel = pickLocalized(commonUi?.noImage, locale, "");
    const backToCatalogLabel = pickLocalized(productUi?.backToCatalog, locale, "");
    const detailsYearLabel = pickLocalized(productUi?.details?.year, locale, "");
    const detailsPagesLabel = pickLocalized(productUi?.details?.pages, locale, "");
    const addToCartLabel = pickLocalized(productUi?.addToCart, locale, "");
    const outOfStockLabel = pickLocalized(productUi?.outOfStock, locale, "");
    const totalLabel = pickLocalized(cartUi?.total, locale, "");
    const youMayLikeLabel = pickLocalized(productUi?.youMayLike, locale, "");
    const byAuthorLabel = pickLocalized(productUi?.byAuthor, locale, "");

    return (
        <AmFullBleed>
            <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={amContent} />
            <main className="bg-bg min-h-screen pt-[60px] md:pt-[80px]">
                <div className="border-b border-line px-4 py-2 flex justify-between items-center bg-paper sticky top-[60px] md:top-[80px] z-20">
                    <Link
                        href={backHref}
                        className="flex items-center gap-2 text-[10px] uppercase font-bold hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
                    >
                        ← {backToCatalogLabel}
                    </Link>
                    <span className="font-mono text-[10px]">{figLabel}</span>
                </div>

                <div className="berlin-press-product-grid border-b border-line">
                    <div className="lg:border-r border-line bg-bg relative h-[60vh] lg:h-[calc(100vh-120px)] sticky top-[120px] flex items-center justify-center p-8 lg:p-20 overflow-hidden">
                        <div className="relative w-full h-full shadow-[20px_20px_0px_0px_rgba(4,15,30,0.1)] border border-line bg-paper animate-fade-in">
                            {item.imageUrl ? (
                                <Image
                                    src={item.imageUrl}
                                    alt={item.imageAlt || item.title}
                                    fill
                                    priority
                                    fetchPriority="high"
                                    sizes="(min-width: 1024px) 50vw, 100vw"
                                    className="object-cover grayscale contrast-110"
                                />
                            ) : (
                                <div className="absolute inset-0 flex items-center justify-center bg-bg text-muted text-xs font-mono uppercase tracking-widest">
                                    {noImageLabel}
                                </div>
                            )}
                        </div>
                        <div className="absolute top-8 left-8 bg-ink text-paper px-3 py-1 font-mono text-xs tracking-widest shadow-sm">
                            FIG. {figLabel}
                        </div>
                    </div>

                    <div className="bg-paper flex flex-col min-h-[calc(100vh-120px)] border-t lg:border-t-0 border-line">
                        <div className="p-8 md:p-16 flex-1">
                            <div className="mb-12">
                                <span className="block text-accent font-mono text-xs mb-4 uppercase tracking-widest">
                                    {categoryTitle}
                                </span>
                                <h1 className="text-6xl md:text-8xl font-serif leading-[0.85] text-ink mb-6 -ml-1">
                                    {item.title}
                                </h1>
                                {authorLine ? (
                                    <p className="text-xl md:text-2xl font-serif italic text-muted border-l-2 border-accent pl-6">
                                        {byAuthorLabel ? `${byAuthorLabel} ${authorLine}` : authorLine}
                                    </p>
                                ) : null}
                            </div>

                            <div className="flex flex-wrap items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted mb-8">
                                <span className="text-ink font-bold">{metaIsbn}</span>
                                <span className="text-ink/30">|</span>
                                <span>{categoryTitle}</span>
                            </div>

                            <div
                                className="border-y border-line"
                                style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))" }}
                            >
                                <div className="border-r border-line p-6 flex flex-col justify-between min-h-[110px]">
                                    <span className="block text-[10px] uppercase text-muted mb-2">{detailsYearLabel}</span>
                                    <span className="font-mono text-lg">{detailYear ?? "—"}</span>
                                </div>
                                <div className="p-6 flex flex-col justify-between min-h-[110px]">
                                    <span className="block text-[10px] uppercase text-muted mb-2">{detailsPagesLabel}</span>
                                    <span className="font-mono text-lg">{detailPages ?? "—"}</span>
                                </div>
                            </div>

                            <div className="py-12">
                                {item.desc ? (
                                    <p className="text-lg leading-relaxed font-light text-justify">{item.desc}</p>
                                ) : null}
                            </div>
                        </div>

                        <AmProductActions
                            id={item.id}
                            title={item.title}
                            price={item.price}
                            isAvailable={item.isAvailable !== false}
                            labels={{
                                total: totalLabel,
                                addToCart: addToCartLabel,
                                outOfStock: outOfStockLabel,
                            }}
                        />
                    </div>
                </div>

                <div className="border-t border-line">
                    <div className="p-4 border-b border-line bg-accent text-ink">
                        <h3 className="font-mono text-xs uppercase tracking-widest">{youMayLikeLabel}</h3>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 border-b border-line">
                        {relatedItems.map((rel) => (
                            <RelatedCard
                                key={rel.id}
                                item={rel}
                                href={storefrontHref(routingContext, `/p/${rel.id}`, { explicitBranchSlug: branchSlug })}
                                noImageLabel={noImageLabel}
                            />
                        ))}
                    </div>
                </div>
            </main>
            <AmFooter locale={locale} amContent={amContent} />
        </AmFullBleed>
    );
}
