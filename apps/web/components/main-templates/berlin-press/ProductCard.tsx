import Link from "next/link";
import Image from "next/image";
import type { AmLocale } from "@/lib/am-locale";
import { pickLocalized, type AmContentV1 } from "@/lib/am-content";
import { AmAddToCartOverlay } from "./AmProductAddToCart";
import type { MenuResponse } from "@vendora/contracts";

type MenuItem = MenuResponse["items"][number];

function IconArrowUpRight(props: { className?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={props.className}
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
            focusable="false"
        >
            <path d="M7 17L17 7M8 7h9v9" />
        </svg>
    );
}

function formatLabel(format: string | undefined, labels: { standard: string; hardcover: string; paperback: string; digital: string; specialEdition: string }) {
    if (!format) return labels.standard;
    const normalized = format.toLowerCase();
    if (normalized === "hardcover") return labels.hardcover;
    if (normalized === "paperback") return labels.paperback;
    if (normalized === "digital") return labels.digital;
    if (normalized === "special_edition") return labels.specialEdition;
    return format;
}

function normalizeTag(tag: string) {
    return tag.trim().toLowerCase();
}

function getYearFromTags(tags: string[]): number | null {
    for (const tag of tags) {
        const trimmed = tag.trim();
        if (/^(19|20)\d{2}$/.test(trimmed)) {
            return Number.parseInt(trimmed, 10);
        }
        const match = trimmed.match(/(19|20)\d{2}/);
        if (match) return Number.parseInt(match[0], 10);
    }
    return null;
}

function getPagesFromTags(tags: string[]): number | null {
    for (const tag of tags) {
        const match = tag.trim().match(/pages:\s*(\d{2,4})/i);
        if (match?.[1]) return Number.parseInt(match[1], 10);
    }
    return null;
}

function getAuthorFromTags(tags: string[]): string {
    for (const tag of tags) {
        if (tag.toLowerCase().startsWith("by ")) {
            return tag.slice(3).trim();
        }
    }
    return "";
}

function getFormatFromTags(tags: string[]): string | undefined {
    const normalized = tags.map(normalizeTag);
    if (normalized.includes("hardcover")) return "hardcover";
    if (normalized.includes("paperback")) return "paperback";
    if (normalized.includes("digital")) return "digital";
    if (normalized.includes("special_edition")) return "special_edition";
    return undefined;
}

function getBadgesFromTags(tags: string[]): string[] {
    const allowed = new Set(["new", "bestseller", "18+"]);
    return tags
        .map(normalizeTag)
        .filter((tag) => allowed.has(tag));
}

type Props = {
    item: MenuItem;
    locale: AmLocale;
    href: string;
    featured?: boolean;
    viewMode?: "grid" | "list";
    ui?: AmContentV1["ui"];
};

export function ProductCard({ item, locale, href, featured = false, viewMode = "grid", ui }: Props) {
    const productUi = ui?.product;
    const commonUi = ui?.common;
    void featured;
    const tags = item.tags ?? [];
    const title = item.title;
    const author = getAuthorFromTags(tags);
    const description = item.desc ?? "";
    const year = getYearFromTags(tags);
    const pages = getPagesFromTags(tags);
    const formatTag = getFormatFromTags(tags);
    const badges = getBadgesFromTags(tags);
    const isPreorder = tags.map(normalizeTag).includes("preorder");
    const isAvailable = item.isAvailable !== false;
    const isSoldOut = !isAvailable;
    const labelStandard = pickLocalized(commonUi?.standard, locale, "");
    const labelHardcover = pickLocalized(productUi?.format?.hardcover, locale, "");
    const labelPaperback = pickLocalized(productUi?.format?.paperback, locale, "");
    const labelDigital = pickLocalized(productUi?.format?.digital, locale, "");
    const labelSpecial = pickLocalized(productUi?.format?.specialEdition, locale, "");
    const formatText = formatLabel(formatTag, {
        standard: labelStandard,
        hardcover: labelHardcover,
        paperback: labelPaperback,
        digital: labelDigital,
        specialEdition: labelSpecial,
    });
    const labelPreorder = pickLocalized(productUi?.preorder, locale, "");
    const labelAddToCart = pickLocalized(productUi?.addToCart, locale, "");
    const labelOutOfStock = pickLocalized(productUi?.outOfStock, locale, "");
    const labelNew = pickLocalized(productUi?.new, locale, "");
    const labelBestseller = pickLocalized(productUi?.bestseller, locale, "");
    const labelByAuthor = pickLocalized(productUi?.byAuthor, locale, "");
    const noImageLabel = pickLocalized(commonUi?.noImage, locale, "");
    const imageUrl = item.imageUrl ?? "";
    const imageAlt = item.imageAlt ?? title;

    if (viewMode === "list") {
        return (
            <Link
                href={href}
                prefetch={false}
                className="group relative block w-full bg-paper border-b border-line hover:bg-bg transition-colors"
            >
                <div className="flex items-stretch min-h-[180px]">
                    {/* Image */}
                    <div className="w-[120px] md:w-[150px] flex-shrink-0 border-r border-line relative overflow-hidden bg-bg">
                        {imageUrl ? (
                            <Image
                                src={imageUrl}
                                alt={imageAlt}
                                fill
                                sizes="(min-width: 768px) 150px, 120px"
                                className={`object-cover transition-all duration-[1000ms] ${isSoldOut ? "opacity-50 grayscale" : "grayscale group-hover:grayscale-0"}`}
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted">
                                {noImageLabel}
                            </div>
                        )}
                        {isPreorder && (
                            <span className="absolute top-2 left-2 bg-accent text-ink px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest">
                                {labelPreorder}
                            </span>
                        )}
                    </div>

                    {/* Content */}
                    <div className="flex-1 p-6 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="text-2xl font-serif text-ink group-hover:text-accent transition-colors">
                                        {title}
                                    </h3>
                                    {author ? (
                                        <p className="font-mono text-xs text-muted uppercase tracking-wider">{author}</p>
                                    ) : null}
                                </div>
                                <span className="font-mono text-xl font-bold text-ink">{item.price.toFixed(2)} €</span>
                            </div>
                            <p className="text-sm text-muted line-clamp-2 max-w-2xl font-light leading-relaxed mt-2">
                                {description}
                            </p>
                        </div>

                        <div className="flex justify-between items-end mt-4">
                            <div className="flex gap-4 text-[10px] uppercase text-muted font-mono">
                                <span>{formatText}</span>
                                {year ? (
                                    <>
                                        <span className="hidden sm:inline">|</span>
                                        <span className="hidden sm:inline">{year}</span>
                                    </>
                                ) : null}
                                {pages ? (
                                    <>
                                        <span className="hidden sm:inline">|</span>
                                        <span className="hidden sm:inline">{pages}p</span>
                                    </>
                                ) : null}
                            </div>

                            {!isSoldOut && (
                                <span className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-ink">
                                    <span>{isPreorder ? labelPreorder : labelAddToCart}</span>
                                    <IconArrowUpRight className="w-3.5 h-3.5" />
                                </span>
                            )}
                            {isSoldOut && (
                                <span className="text-xs uppercase font-bold text-muted">{labelOutOfStock}</span>
                            )}
                        </div>
                    </div>
                </div>
            </Link>
        );
    }

    return (
        <Link
            href={href}
            prefetch={false}
            className="group relative block h-full w-full bg-paper border-r border-b border-line transition-shadow duration-300 hover:z-20 hover:shadow-theme"
        >
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center px-4 py-3 border-b border-line bg-paper text-[9px] font-mono uppercase tracking-wider text-muted">
                    <div className="flex gap-3">
                        <span className="text-ink font-bold">{year ?? "—"}</span>
                        <span className="hidden sm:inline text-ink/20">|</span>
                        <span className="hidden sm:inline">{formatText}</span>
                    </div>
                    <div className="flex gap-2">
                        <span>{formatText}</span>
                    </div>
                </div>

                <div className="relative w-full aspect-[3/4] border-b border-line overflow-hidden bg-bg perspective-1000">
                    <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 items-start pointer-events-none">
                        {isPreorder && (
                            <span className="bg-accent text-ink px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                {labelPreorder}
                            </span>
                        )}
                        {badges.includes("new") && (
                            <span className="bg-ink text-paper px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                {labelNew}
                            </span>
                        )}
                        {badges.includes("bestseller") && (
                            <span className="bg-paper text-ink border border-line px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                {labelBestseller}
                            </span>
                        )}
                    </div>

                    {imageUrl ? (
                        <div className="w-full h-full transform transition-transform duration-700 group-hover:scale-105">
                            <Image
                                src={imageUrl}
                                alt={imageAlt}
                                fill
                                sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                                className={`object-cover transition-all duration-[1000ms] ease-out-quart ${isSoldOut ? "opacity-50 grayscale" : "grayscale group-hover:grayscale-0"}`}
                            />
                        </div>
                    ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] uppercase tracking-widest text-muted">
                            {noImageLabel}
                        </div>
                    )}

                    {isSoldOut && (
                        <div className="absolute inset-0 flex items-center justify-center bg-paper/40 backdrop-blur-[2px] z-10 pointer-events-none">
                            <div className="bg-ink text-paper px-6 py-3 font-mono text-xs uppercase tracking-[0.2em] border-2 border-paper shadow-lg">
                                {labelOutOfStock}
                            </div>
                        </div>
                    )}

                    {!isSoldOut && (
                        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out-quart z-20">
                            <AmAddToCartOverlay
                                id={item.id}
                                title={title}
                                price={item.price}
                                label={isPreorder ? labelPreorder : labelAddToCart}
                            />
                        </div>
                    )}
                </div>

                <div className="p-5 flex flex-col flex-1 justify-between gap-4 bg-paper relative">
                    <div>
                        <h3 className="text-2xl font-serif leading-[1.0] mb-2 group-hover:text-accent transition-colors duration-300 line-clamp-2 min-h-[2em] text-ink">
                            {title}
                        </h3>
                        {author ? (
                            <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted mb-4 truncate">
                                {labelByAuthor} <span className="text-ink font-bold">{author}</span>
                            </p>
                        ) : null}
                    </div>

                    <div className="flex items-end justify-between">
                        <div>
                            {item.oldPrice ? (
                                <div className="text-xs text-muted line-through">{item.oldPrice.toFixed(2)} €</div>
                            ) : null}
                            <div className="font-serif text-xl font-medium text-ink leading-none">
                                {item.price.toFixed(2)} €
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
}
