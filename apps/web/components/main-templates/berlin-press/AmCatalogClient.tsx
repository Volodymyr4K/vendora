"use client";

import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { memo, useCallback, useMemo, useState } from "react";
import type { MenuResponse } from "@vendora/contracts";
import type { RoutingContext } from "@/lib/routing-types";
import { storefrontHref } from "@/lib/routing-helpers";
import { useCart } from "@/components/cart/CartProvider";
import { AmCatalogQuickAdd } from "./AmCatalogQuickAdd";

type MenuItem = MenuResponse["items"][number];
const EMPTY_ITEMS: MenuItem[] = [];
const SORT_OPTIONS = ["default", "newest", "price_asc", "price_desc", "alpha_asc"] as const;
type SortOption = (typeof SORT_OPTIONS)[number];

type CatalogLabels = {
    archiveInventory: string;
    titleAll: string;
    categoryLabel: string;
    sortBy: string;
    viewGrid: string;
    viewList: string;
    sortOptions: {
        default: string;
        newest: string;
        priceAsc: string;
        priceDesc: string;
        alphaAsc: string;
    };
    showingResults: string;
    openSystem: string;
    filters: {
        title: string;
        priceRange: string;
        apply: string;
        availability: string;
        inStock: string;
        format: string;
        authors: string;
        noResults: string;
    };
};

type ProductLabels = {
    addToCart: string;
    makePreorder: string;
    preorder: string;
    new: string;
    bestseller: string;
    outOfStock: string;
    format: {
        hardcover: string;
        paperback: string;
        digital: string;
        specialEdition: string;
    };
};

type CommonLabels = {
    noImage: string;
    itemsLabel: string;
};

type NavLabels = {
    preorder: string;
};

type Labels = {
    catalog: CatalogLabels;
    product: ProductLabels;
    common: CommonLabels;
    nav: NavLabels;
};

type Props = {
    tenantSlug: string;
    branchSlug: string;
    menu: MenuResponse;
    routingContext: RoutingContext;
    labels: Labels;
};

function formatLabel(format: string | undefined, labels: ProductLabels) {
    if (!format) return "";
    const normalized = format.toLowerCase();
    if (normalized === "hardcover") return labels.format.hardcover;
    if (normalized === "paperback") return labels.format.paperback;
    if (normalized === "digital") return labels.format.digital;
    if (normalized === "special_edition") return labels.format.specialEdition;
    return format;
}

function normalizeTag(tag: string) {
    return tag.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function isPreorderItem(item: MenuItem) {
    return (item.tags ?? []).some((tag) => {
        const normalized = normalizeTag(tag);
        return normalized === "preorder" || normalized === "pre_order";
    });
}

function getReleaseYear(item: MenuItem): number | null {
    const yearTag = item.tags?.find((tag) => /^(19|20)\d{2}$/.test(tag.trim()));
    if (yearTag) {
        const parsed = Number.parseInt(yearTag.trim(), 10);
        return Number.isFinite(parsed) ? parsed : null;
    }
    if (typeof item.weightG === "number" && item.weightG >= 1900 && item.weightG <= 2100) {
        return Math.round(item.weightG);
    }
    return null;
}

const CategoryBlock = memo(function CategoryBlock({
    title,
    items,
    routingContext,
    branchSlug,
    labels,
    viewMode,
}: {
    title: string;
    items: MenuItem[];
    routingContext: RoutingContext;
    branchSlug: string;
    labels: Labels;
    viewMode: "grid" | "list";
}) {
    if (items.length === 0) return null;
    return (
        <section className="border-b border-line bg-paper">
            <div className="grid grid-cols-1 md:grid-cols-12">
                <div className="hidden md:flex md:col-span-1 border-r border-line items-center justify-center py-10 md:py-0 bg-paper">
                    <h2 className="md:-rotate-90 text-xs md:text-sm font-bold uppercase tracking-[0.3em] whitespace-nowrap">
                        {title}
                    </h2>
                </div>
                <div className="md:col-span-11">
                    <div className="w-full px-6 md:pl-6 md:pr-10 py-10 md:py-14">
                        <div className="flex items-center justify-between border-b border-line pb-4 mb-10">
                            <div className="flex items-center gap-3">
                                <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">{labels.catalog.categoryLabel}</span>
                                <h3 className="text-3xl md:text-4xl font-serif text-ink">{title}</h3>
                            </div>
                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                                {items.length.toString().padStart(2, "0")} {labels.common.itemsLabel}
                            </span>
                        </div>
                        <div
                            className={`border border-line bg-paper ${
                                viewMode === "list" ? "flex flex-col" : "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4"
                            }`}
                        >
                            {items.map((item) => (
                                <CatalogCard
                                    key={item.id}
                                    item={item}
                                    categoryTitle={title}
                                    href={storefrontHref(routingContext, `/p/${item.id}`, { explicitBranchSlug: branchSlug })}
                                    labels={labels}
                                    viewMode={viewMode}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
});

CategoryBlock.displayName = "CategoryBlock";

function QuickAddInline({ id, title, price, label }: { id: string; title: string; price: number; label: string }) {
    const cart = useCart();
    return (
        <button
            type="button"
            onClick={(event) => {
                event.preventDefault();
                event.stopPropagation();
                cart.add({ id, title, priceSnapshot: price }, 1);
            }}
            className="flex items-center gap-2 text-xs uppercase font-bold tracking-widest text-ink hover:text-accent transition-colors"
        >
            <span>{label}</span>
            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M7 17L17 7M8 7h9v9" />
            </svg>
        </button>
    );
}

const CatalogCard = memo(function CatalogCard({
    item,
    href,
    categoryTitle,
    labels,
    viewMode,
}: {
    item: MenuItem;
    href: string;
    categoryTitle: string;
    labels: Labels;
    viewMode: "grid" | "list";
}) {
    const isUnavailable = item.isAvailable === false;
    const tagLabel = item.tags?.[0];
    const rawFormat = item.tags?.find((t) => ["hardcover", "paperback", "digital", "special_edition"].includes(t.toLowerCase()));
    const formatTag = rawFormat ? formatLabel(rawFormat, labels.product) : null;
    const isbnLike = item.slug || item.id;
    const releaseYear = getReleaseYear(item);
    const badgeTag = item.tags?.find((t) => ["new", "bestseller", "preorder"].includes(t.toLowerCase()));
    const badge = badgeTag ? badgeTag.toLowerCase() : null;
    const isPreorder = isPreorderItem(item);
    const quickAddLabel = isPreorder ? labels.product.makePreorder : labels.product.addToCart;

    if (viewMode === "list") {
        return (
            <Link
                href={href}
                prefetch={false}
                className="group relative block w-full bg-paper border-b border-line hover:bg-bg transition-colors"
            >
                <div className="flex items-stretch min-h-[180px]">
                    <div className="w-[120px] md:w-[150px] flex-shrink-0 border-r border-line relative overflow-hidden bg-bg">
                        {item.imageUrl ? (
                            <Image
                                src={item.imageUrl}
                                alt={item.imageAlt || item.title}
                                fill
                                sizes="(min-width: 768px) 150px, 120px"
                                className={`object-cover transition-all duration-[1000ms] ${
                                    isUnavailable ? "opacity-50 grayscale" : "grayscale group-hover:grayscale-0"
                                }`}
                            />
                        ) : (
                            <div className="absolute inset-0 flex items-center justify-center bg-bg text-muted text-xs font-mono uppercase tracking-widest">
                                {labels.common.noImage}
                            </div>
                        )}
                        {badge ? (
                            <div className="absolute top-2 left-2 z-10">
                                {badge === "preorder" ? (
                                    <span className="bg-accent text-paper px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest shadow-sm">
                                        {labels.product.preorder}
                                    </span>
                                ) : badge === "new" ? (
                                    <span className="bg-ink text-paper px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest shadow-sm">
                                        {labels.product.new}
                                    </span>
                                ) : (
                                    <span className="bg-paper text-ink border border-line px-2 py-0.5 text-[8px] font-bold uppercase tracking-widest shadow-sm">
                                        {labels.product.bestseller}
                                    </span>
                                )}
                            </div>
                        ) : null}
                    </div>

                    <div className="flex-1 p-6 flex flex-col justify-between">
                        <div>
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <h3 className="text-2xl font-serif text-ink group-hover:text-accent transition-colors">
                                        {item.title}
                                    </h3>
                                    <p className="font-mono text-xs text-muted uppercase tracking-wider">
                                        {labels.catalog.categoryLabel} <span className="text-ink font-bold">{categoryTitle}</span>
                                    </p>
                                </div>
                                <span className="font-mono text-xl font-bold text-ink">{item.price.toFixed(2)} €</span>
                            </div>
                            <p className="text-sm text-muted line-clamp-2 max-w-2xl font-light leading-relaxed mt-2">
                                {item.desc}
                            </p>
                        </div>

                        <div className="flex justify-between items-end mt-4">
                            <div className="flex gap-4 text-[10px] uppercase text-muted font-mono">
                                {formatTag ? <span>{formatTag}</span> : null}
                                {releaseYear ? <span className="hidden sm:inline">|</span> : null}
                                {releaseYear ? <span className="hidden sm:inline">{releaseYear}</span> : null}
                            </div>

                            {!isUnavailable ? (
                                <QuickAddInline id={item.id} title={item.title} price={item.price} label={quickAddLabel} />
                            ) : (
                                <span className="text-xs uppercase font-bold text-muted">{labels.product.outOfStock}</span>
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
            className="group relative block h-full w-full bg-paper border-r border-b border-line hover:z-20 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
            <div className="flex flex-col h-full">
                <div className="flex justify-between items-center px-4 py-3 border-b border-line bg-paper text-[9px] font-mono uppercase tracking-[0.25em] text-muted transition-colors group-hover:text-ink/70">
                    <div className="flex items-center gap-3">
                        <span className="text-ink font-bold tracking-[0.2em]">{isbnLike}</span>
                        {releaseYear ? <span className="hidden sm:inline text-ink/40">|</span> : null}
                        {releaseYear ? <span className="hidden sm:inline">{releaseYear}</span> : null}
                    </div>
                    <div className="flex gap-2">
                        {formatTag ? <span className="text-accent">{formatTag}</span> : null}
                    </div>
                </div>

                <div className="relative w-full aspect-[3/4] border-b border-line overflow-hidden bg-bg perspective-1000">
                    {item.imageUrl ? (
                        <Image
                            src={item.imageUrl}
                            alt={item.imageAlt || item.title}
                            fill
                            sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                            className={`object-cover transition-all duration-[1200ms] ease-out-quart ${isUnavailable ? "opacity-40 grayscale" : "grayscale group-hover:grayscale-0"} group-hover:scale-[1.05]`}
                        />
                    ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-bg text-muted text-xs font-mono uppercase tracking-widest">
                            {labels.common.noImage}
                        </div>
                    )}
                    {item.tags?.length ? (
                        <div className="absolute top-3 left-3 z-20 flex flex-col gap-2 items-start pointer-events-none">
                            {item.tags.slice(0, 2).map((tag) => (
                                <span key={tag} className="bg-paper text-ink border border-line px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                    {tag}
                                </span>
                            ))}
                        </div>
                    ) : null}
                    {badge ? (
                        <div className="absolute top-3 right-3 z-20 pointer-events-none">
                            {badge === "preorder" ? (
                                <span className="bg-accent text-paper px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                    {labels.product.preorder}
                                </span>
                            ) : badge === "new" ? (
                                <span className="bg-ink text-paper px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                    {labels.product.new}
                                </span>
                            ) : (
                                <span className="bg-paper text-ink border border-line px-2 py-1 text-[9px] font-bold uppercase tracking-widest shadow-sm">
                                    {labels.product.bestseller}
                                </span>
                            )}
                        </div>
                    ) : null}
                    {!isUnavailable && (
                        <div className="absolute inset-x-0 bottom-0 translate-y-full group-hover:translate-y-0 transition-transform duration-300 ease-out-quart z-20">
                            <AmCatalogQuickAdd id={item.id} title={item.title} price={item.price} label={quickAddLabel} />
                        </div>
                    )}
                    {isUnavailable && (
                        <div className="absolute inset-0 flex items-center justify-center bg-paper/50 backdrop-blur-[2px]">
                            <div className="bg-ink text-paper px-4 py-2 text-[9px] font-bold uppercase tracking-[0.2em] border-2 border-paper shadow-lg">
                                {labels.product.outOfStock}
                            </div>
                        </div>
                    )}
                </div>

                <div className="p-5 flex flex-col flex-1 justify-between gap-5 bg-paper relative">
                    <div>
                        <h3 className="text-[26px] md:text-[28px] font-serif leading-[0.95] mb-2 group-hover:text-accent transition-colors duration-300 line-clamp-2 min-h-[2em] text-ink">
                            {item.title}
                        </h3>
                        <p className="font-mono text-[10px] uppercase tracking-[0.15em] text-muted mb-4 truncate">
                            {labels.catalog.categoryLabel} <span className="text-ink font-bold">{categoryTitle}</span>
                        </p>
                        <p className="text-[13px] text-muted line-clamp-2 leading-relaxed">{item.desc}</p>
                        {tagLabel ? (
                            <div className="flex flex-wrap gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-300 absolute top-[-1.25rem] right-2 bg-paper px-2 border border-line">
                                <span className="text-[9px] uppercase font-bold tracking-wider text-ink">{tagLabel}</span>
                            </div>
                        ) : null}
                    </div>

                    <div className="pt-4 border-t border-line/40 flex items-end justify-between">
                        <div>
                            {item.oldPrice ? (
                                <div className="text-xs text-muted line-through decoration-accent decoration-1 mb-0.5">
                                    {item.oldPrice.toFixed(2)} €
                                </div>
                            ) : null}
                            <div className="font-serif text-[22px] font-medium text-ink leading-none">{item.price.toFixed(2)} €</div>
                        </div>
                        <div className="w-8 h-8 rounded-full border border-line flex items-center justify-center group-hover:bg-ink group-hover:border-ink transition-all duration-300">
                            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 text-muted group-hover:text-paper transition-colors" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                <path d="M7 17L17 7M8 7h9v9" />
                            </svg>
                        </div>
                    </div>
                </div>
            </div>
        </Link>
    );
});

CatalogCard.displayName = "CatalogCard";

const FilterCheckbox = memo(function FilterCheckbox(props: {
    checked: boolean;
    onChange: (checked: boolean) => void;
    label: string;
    labelClassName?: string;
    className?: string;
}) {
    return (
        <label className={`flex items-center gap-3 cursor-pointer group ${props.className ?? ""}`}>
            <input
                type="checkbox"
                className="sr-only"
                checked={props.checked}
                onChange={(event) => props.onChange(event.target.checked)}
            />
            <span
                className={`w-4 h-4 border border-line flex items-center justify-center transition-colors ${
                    props.checked ? "bg-ink/10 border-ink" : "bg-paper"
                }`}
                aria-hidden="true"
            >
                <span className={`w-2 h-2 bg-ink transition-opacity ${props.checked ? "opacity-100" : "opacity-0"}`} />
            </span>
            <span className={props.labelClassName ?? "text-sm font-mono uppercase text-muted group-hover:text-ink transition-colors"}>
                {props.label}
            </span>
        </label>
    );
});

FilterCheckbox.displayName = "FilterCheckbox";

const FiltersPanel = memo(function FiltersPanel(props: {
    labels: Labels;
    resultCount: number;
    priceMin: string;
    priceMax: string;
    onPriceMinChange: (value: string) => void;
    onPriceMaxChange: (value: string) => void;
    onApplyPrice: () => void;
    inStockOnly: boolean;
    onToggleInStock: (value: boolean) => void;
    preordersOnly: boolean;
    onTogglePreorders: (value: boolean) => void;
    selectedFormats: string[];
    onToggleFormat: (id: string) => void;
    selectedAuthors: string[];
    onToggleAuthor: (id: string) => void;
    className?: string;
}) {
    const formatOptions = useMemo(
        () => [
            { id: "hardcover", label: props.labels.product.format.hardcover },
            { id: "paperback", label: props.labels.product.format.paperback },
            { id: "digital", label: props.labels.product.format.digital },
            { id: "special_edition", label: props.labels.product.format.specialEdition },
        ],
        [props.labels.product.format]
    );
    const authorOptions = useMemo(
        () => [
            { id: "various", label: "Various" },
            { id: "new_voices", label: "New voices" },
            { id: "classics", label: "Classics" },
        ],
        []
    );
    const applyLabel = useMemo(
        () => props.labels.catalog.filters.apply.replaceAll("{count}", String(props.resultCount)),
        [props.labels.catalog.filters.apply, props.resultCount]
    );

    return (
        <div className={props.className}>
            <details className="group border-b border-line/40" open>
                <summary className="flex justify-between items-center py-4 cursor-pointer list-none outline-none group-hover:text-accent">
                    <span className="font-bold uppercase text-[11px] tracking-[0.25em]">{props.labels.catalog.filters.priceRange}</span>
                    <span className="transition-transform group-open:rotate-180">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </summary>
                <div className="pb-6">
                    <div className="flex items-center gap-2 mb-4">
                        <input
                            type="number"
                            placeholder="Min"
                            value={props.priceMin}
                            onChange={(event) => props.onPriceMinChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") props.onApplyPrice();
                            }}
                            className="w-full bg-paper border border-line p-2 text-sm font-mono focus:bg-accent/10 outline-none"
                        />
                        <span className="text-muted">-</span>
                        <input
                            type="number"
                            placeholder="Max"
                            value={props.priceMax}
                            onChange={(event) => props.onPriceMaxChange(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === "Enter") props.onApplyPrice();
                            }}
                            className="w-full bg-paper border border-line p-2 text-sm font-mono focus:bg-accent/10 outline-none"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={props.onApplyPrice}
                        className="w-full bg-ink text-paper py-2 text-[10px] uppercase font-bold tracking-[0.2em] hover:bg-accent transition-colors"
                    >
                        {applyLabel}
                    </button>
                </div>
            </details>

            <details className="group border-b border-line/40" open>
                <summary className="flex justify-between items-center py-4 cursor-pointer list-none outline-none group-hover:text-accent">
                    <span className="font-bold uppercase text-[11px] tracking-[0.25em]">{props.labels.catalog.filters.availability}</span>
                    <span className="transition-transform group-open:rotate-180">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </summary>
                <div className="pb-6">
                    <FilterCheckbox
                        checked={props.inStockOnly}
                        onChange={props.onToggleInStock}
                        label={props.labels.catalog.filters.inStock}
                        className="mb-2"
                    />
                    <FilterCheckbox
                        checked={props.preordersOnly}
                        onChange={props.onTogglePreorders}
                        label={props.labels.nav.preorder}
                    />
                </div>
            </details>

            <details className="group border-b border-line/40" open>
                <summary className="flex justify-between items-center py-4 cursor-pointer list-none outline-none group-hover:text-accent">
                    <span className="font-bold uppercase text-[11px] tracking-[0.25em]">{props.labels.catalog.filters.format}</span>
                    <span className="transition-transform group-open:rotate-180">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </summary>
                <div className="pb-6 flex flex-col gap-2">
                    {formatOptions.map((option) => (
                        <FilterCheckbox
                            key={option.id}
                            checked={props.selectedFormats.includes(option.id)}
                            onChange={() => props.onToggleFormat(option.id)}
                            label={option.label}
                        />
                    ))}
                </div>
            </details>

            <details className="group border-b border-line/40" open>
                <summary className="flex justify-between items-center py-4 cursor-pointer list-none outline-none group-hover:text-accent">
                    <span className="font-bold uppercase text-[11px] tracking-[0.25em]">{props.labels.catalog.filters.authors}</span>
                    <span className="transition-transform group-open:rotate-180">
                        <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                            <path d="M6 9l6 6 6-6" />
                        </svg>
                    </span>
                </summary>
                <div className="pb-6 flex flex-col gap-3">
                    {authorOptions.map((option) => (
                        <FilterCheckbox
                            key={option.id}
                            checked={props.selectedAuthors.includes(option.id)}
                            onChange={() => props.onToggleAuthor(option.id)}
                            label={option.label}
                            labelClassName="text-sm font-serif italic text-muted group-hover:text-ink transition-colors"
                        />
                    ))}
                </div>
            </details>
        </div>
    );
});

FiltersPanel.displayName = "FiltersPanel";

export function AmCatalogClient({ tenantSlug, branchSlug, menu, routingContext, labels }: Props) {
    void tenantSlug;
    const searchParams = useSearchParams();
    const searchQuery = (searchParams.get("search") ?? "").trim();
    const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
    const [sortOpen, setSortOpen] = useState(false);
    const [sortOption, setSortOption] = useState<SortOption>("default");
    const [priceMin, setPriceMin] = useState("");
    const [priceMax, setPriceMax] = useState("");
    const [appliedPrice, setAppliedPrice] = useState<{ min: number | null; max: number | null }>({
        min: null,
        max: null,
    });
    const [inStockOnly, setInStockOnly] = useState(false);
    const [preordersOnly, setPreordersOnly] = useState(false);
    const [selectedFormats, setSelectedFormats] = useState<string[]>([]);
    const [selectedAuthors, setSelectedAuthors] = useState<string[]>([]);
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const normalizedQuery = useMemo(() => searchQuery.toLowerCase(), [searchQuery]);
    const formatSet = useMemo(() => new Set(selectedFormats.map(normalizeTag)), [selectedFormats]);
    const authorSet = useMemo(() => new Set(selectedAuthors.map(normalizeTag)), [selectedAuthors]);

    const applyPriceRange = useCallback(() => {
        const minRaw = Number(priceMin);
        const maxRaw = Number(priceMax);
        const min = Number.isFinite(minRaw) && priceMin.trim() !== "" ? minRaw : null;
        const max = Number.isFinite(maxRaw) && priceMax.trim() !== "" ? maxRaw : null;
        if (min !== null && max !== null && min > max) {
            setAppliedPrice({ min: max, max: min });
            return;
        }
        setAppliedPrice({ min, max });
    }, [priceMin, priceMax]);

    const toggleFormat = useCallback((id: string) => {
        setSelectedFormats((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    }, []);

    const toggleAuthor = useCallback((id: string) => {
        setSelectedAuthors((prev) => (prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]));
    }, []);

    const categories = useMemo(() => menu.categories.filter((c) => c.isAvailable !== false), [menu.categories]);
    const categoryTitleBySlug = useMemo(() => {
        const map = new Map<string, string>();
        for (const cat of categories) {
            map.set(cat.slug, cat.title);
        }
        return map;
    }, [categories]);
    const itemMeta = useMemo(() => {
        const map = new Map<string, { normalizedTags: string[]; searchText: string; releaseYear: number | null; isPreorder: boolean }>();
        for (const item of menu.items) {
            const tags = item.tags ?? [];
            const normalizedTags = tags.map(normalizeTag);
            const categoryTitle = categoryTitleBySlug.get(item.categorySlug) ?? "";
            const searchText = `${item.title} ${item.desc ?? ""} ${categoryTitle} ${tags.join(" ")}`.toLowerCase();
            const releaseYear = getReleaseYear(item);
            const isPreorder = normalizedTags.some((tag) => tag === "preorder" || tag === "pre_order");
            map.set(item.id, { normalizedTags, searchText, releaseYear, isPreorder });
        }
        return map;
    }, [menu.items, categoryTitleBySlug]);
    const filteredItems = useMemo(() => {
        const hasFormatFilter = formatSet.size > 0;
        const hasAuthorFilter = authorSet.size > 0;
        return menu.items.filter((item) => {
            const price = item.price ?? 0;
            if (appliedPrice.min !== null && price < appliedPrice.min) return false;
            if (appliedPrice.max !== null && price > appliedPrice.max) return false;
            if (inStockOnly && item.isAvailable === false) return false;
            if (preordersOnly && !itemMeta.get(item.id)?.isPreorder) return false;

            if (normalizedQuery) {
                const hay = itemMeta.get(item.id)?.searchText ?? "";
                if (!hay.includes(normalizedQuery)) return false;
            }

            if (hasFormatFilter || hasAuthorFilter) {
                const tags = itemMeta.get(item.id)?.normalizedTags ?? [];
                if (hasFormatFilter && !tags.some((tag) => formatSet.has(tag))) return false;
                if (hasAuthorFilter && !tags.some((tag) => authorSet.has(tag))) return false;
            }
            return true;
        });
    }, [menu.items, appliedPrice, inStockOnly, preordersOnly, normalizedQuery, itemMeta, formatSet, authorSet]);

    const itemsByCategory = useMemo(() => {
        const indexMap = sortOption === "default"
            ? null
            : new Map(menu.items.map((item, idx) => [item.id, idx]));
        const compare = (a: MenuItem, b: MenuItem) => {
            if (sortOption === "price_asc") {
                const delta = a.price - b.price;
                if (delta !== 0) return delta;
            }
            if (sortOption === "price_desc") {
                const delta = b.price - a.price;
                if (delta !== 0) return delta;
            }
            if (sortOption === "alpha_asc") {
                const delta = a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
                if (delta !== 0) return delta;
            }
            if (sortOption === "newest") {
                const numA = itemMeta.get(a.id)?.releaseYear ?? null;
                const numB = itemMeta.get(b.id)?.releaseYear ?? null;
                if (numA !== null || numB !== null) {
                    const delta = (numB ?? 0) - (numA ?? 0);
                    if (delta !== 0) return delta;
                }
            }
            const indexA = indexMap?.get(a.id) ?? 0;
            const indexB = indexMap?.get(b.id) ?? 0;
            return indexA - indexB;
        };

        const map = new Map<string, MenuItem[]>();
        for (const item of filteredItems) {
            const list = map.get(item.categorySlug) || [];
            list.push(item);
            map.set(item.categorySlug, list);
        }
        if (sortOption === "default") {
            return map;
        }
        for (const [slug, list] of map.entries()) {
            map.set(slug, [...list].sort(compare));
        }
        return map;
    }, [filteredItems, sortOption, itemMeta, menu.items]);

    const categoryEntries = useMemo(
        () =>
            categories
                .map((category) => ({
                    category,
                    items: itemsByCategory.get(category.slug) ?? EMPTY_ITEMS,
                }))
                .filter((entry) => entry.items.length > 0),
        [categories, itemsByCategory]
    );
    const totalItems = filteredItems.length;
    const sortLabelMap = useMemo(
        (): Record<SortOption, string> => ({
            default: labels.catalog.sortOptions.default,
            newest: labels.catalog.sortOptions.newest,
            price_asc: labels.catalog.sortOptions.priceAsc,
            price_desc: labels.catalog.sortOptions.priceDesc,
            alpha_asc: labels.catalog.sortOptions.alphaAsc,
        }),
        [labels.catalog.sortOptions]
    );
    const activeSortLabel = sortLabelMap[sortOption];
    const showingResultsText = useMemo(
        () => labels.catalog.showingResults.replaceAll("{count}", String(totalItems)),
        [labels.catalog.showingResults, totalItems]
    );

    return (
        <main className="bg-bg min-h-screen pt-[60px] md:pt-[80px]">
            <section className="border-b border-line/20 bg-ink text-paper relative z-20 overflow-visible berlin-press-ink-surface min-h-[260px] md:min-h-[320px] flex items-center">
                <div className="max-w-6xl mx-auto px-6 md:px-10 py-10 md:py-14">
                    <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-8">
                        <div className="md:-translate-x-56">
                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-paper/60 block mb-3">
                                {labels.catalog.archiveInventory}
                            </span>
                            <h1 className="text-5xl md:text-8xl font-serif uppercase leading-[0.88] text-paper">{labels.catalog.titleAll}</h1>
                        </div>

                        <div className="flex gap-3 items-center md:translate-x-[clamp(0px,calc((100vw-84rem)/2-24px),999px)]">
                            <div className="hidden md:flex border border-paper/15 bg-ink/60 text-paper/80 backdrop-blur-[1px]">
                                <button
                                    type="button"
                                    onClick={() => setViewMode("grid")}
                                    className={`p-3 transition-colors ${
                                        viewMode === "grid" ? "bg-paper/20 text-paper" : "text-paper/70 hover:text-paper hover:bg-paper/10"
                                    }`}
                                    aria-label={labels.catalog.viewGrid}
                                    title={labels.catalog.viewGrid}
                                >
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" />
                                    </svg>
                                </button>
                                <div className="w-px bg-paper/15" />
                                <button
                                    type="button"
                                    onClick={() => setViewMode("list")}
                                    className={`p-3 transition-colors ${
                                        viewMode === "list" ? "bg-paper/20 text-paper" : "text-paper/70 hover:text-paper hover:bg-paper/10"
                                    }`}
                                    aria-label={labels.catalog.viewList}
                                    title={labels.catalog.viewList}
                                >
                                    <svg viewBox="0 0 24 24" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                        <path d="M4 6h16M4 12h16M4 18h16" />
                                    </svg>
                                </button>
                            </div>
                            <div className="relative hidden md:block">
                                <button
                                    type="button"
                                    onClick={() => setSortOpen((open) => !open)}
                                    className="flex items-center gap-3 font-mono text-[10px] uppercase tracking-[0.2em] border border-paper/15 px-6 py-3 hover:bg-paper/10 hover:text-paper transition-colors bg-ink/60 text-paper/80 min-w-[220px] justify-between focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-paper/60 focus-visible:ring-offset-2 focus-visible:ring-offset-ink backdrop-blur-[1px]"
                                    aria-expanded={sortOpen}
                                >
                                    <span>
                                        {labels.catalog.sortBy}: <span className="font-bold ml-1">{activeSortLabel}</span>
                                    </span>
                                    <svg
                                        viewBox="0 0 24 24"
                                        className={`w-3.5 h-3.5 transition-transform ${sortOpen ? "rotate-180" : ""}`}
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                        aria-hidden="true"
                                    >
                                        <path d="M6 9l6 6 6-6" />
                                    </svg>
                                </button>

                                {sortOpen ? (
                                    <div className="absolute right-0 top-full mt-[-1px] w-full bg-ink border border-paper/20 shadow-2xl z-30 animate-fade-in">
                                        {SORT_OPTIONS.map((opt) => (
                                            <button
                                                key={opt}
                                                type="button"
                                                onClick={() => {
                                                    setSortOption(opt);
                                                    setSortOpen(false);
                                                }}
                                                className={`block w-full text-left px-6 py-3 font-mono text-[10px] uppercase tracking-[0.2em] hover:bg-paper/10 transition-colors ${
                                                    sortOption === opt ? "bg-paper/15 text-paper" : "text-paper/80"
                                                }`}
                                            >
                                                {sortLabelMap[opt]}
                                            </button>
                                        ))}
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <div className="md:hidden border-b border-line p-4 sticky top-[60px] bg-paper z-30 flex justify-between items-center shadow-md">
                <span className="font-mono text-xs font-bold text-ink">{showingResultsText}</span>
                <button
                    type="button"
                    onClick={() => setMobileFiltersOpen((open) => !open)}
                    aria-expanded={mobileFiltersOpen}
                    aria-controls="berlin-press-catalog-filters"
                    className="flex items-center gap-2 text-[10px] uppercase font-bold border border-line px-4 py-3 bg-ink text-paper"
                >
                    {labels.catalog.filters.title}
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M3 5h18M6 12h12M10 19h4" />
                    </svg>
                </button>
            </div>

            {mobileFiltersOpen ? (
                <div id="berlin-press-catalog-filters" className="md:hidden border-b border-line bg-bg">
                    <div className="p-6">
                        <FiltersPanel
                            labels={labels}
                            resultCount={totalItems}
                            priceMin={priceMin}
                            priceMax={priceMax}
                            onPriceMinChange={setPriceMin}
                            onPriceMaxChange={setPriceMax}
                            onApplyPrice={applyPriceRange}
                            inStockOnly={inStockOnly}
                            onToggleInStock={setInStockOnly}
                            preordersOnly={preordersOnly}
                            onTogglePreorders={setPreordersOnly}
                            selectedFormats={selectedFormats}
                            onToggleFormat={toggleFormat}
                            selectedAuthors={selectedAuthors}
                            onToggleAuthor={toggleAuthor}
                        />
                    </div>
                </div>
            ) : null}

            <div className="flex flex-col md:flex-row border-b border-line min-h-screen relative">
                <aside className="hidden md:block w-[300px] xl:w-[360px] border-r border-line bg-bg flex-shrink-0 relative z-10">
                    <div className="sticky top-[80px] h-[calc(100vh-80px)] overflow-y-auto p-8">
                        <FiltersPanel
                            labels={labels}
                            resultCount={totalItems}
                            priceMin={priceMin}
                            priceMax={priceMax}
                            onPriceMinChange={setPriceMin}
                            onPriceMaxChange={setPriceMax}
                            onApplyPrice={applyPriceRange}
                            inStockOnly={inStockOnly}
                            onToggleInStock={setInStockOnly}
                            preordersOnly={preordersOnly}
                            onTogglePreorders={setPreordersOnly}
                            selectedFormats={selectedFormats}
                            onToggleFormat={toggleFormat}
                            selectedAuthors={selectedAuthors}
                            onToggleAuthor={toggleAuthor}
                        />
                    </div>
                </aside>

                <div className="flex-1 bg-paper">
                    {totalItems > 0 ? (
                        categoryEntries.map(({ category, items }) => (
                            <CategoryBlock
                                key={category.id}
                                title={category.title}
                                items={items}
                                routingContext={routingContext}
                                branchSlug={branchSlug}
                                labels={labels}
                                viewMode={viewMode}
                            />
                        ))
                    ) : (
                        <div className="h-full min-h-[60vh] flex flex-col items-center justify-center p-20 text-center font-mono uppercase text-muted">
                            <div className="w-20 h-20 border border-line flex items-center justify-center rounded-full mb-6">
                                <svg viewBox="0 0 24 24" className="w-8 h-8 opacity-60" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                                    <path d="M18 6L6 18M6 6l12 12" />
                                </svg>
                            </div>
                            <p className="mb-4">{labels.catalog.filters.noResults}</p>
                            <Link
                                href={storefrontHref(routingContext, "/menu", { explicitBranchSlug: branchSlug })}
                                className="text-[10px] uppercase underline hover:text-ink transition-colors"
                            >
                                {labels.catalog.openSystem} →
                            </Link>
                        </div>
                    )}
                </div>
            </div>
        </main>
    );
}
