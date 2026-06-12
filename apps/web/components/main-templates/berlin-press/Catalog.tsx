import type { MenuResponse } from "@vendora/contracts";
import dynamic from "next/dynamic";
import type { RoutingContext } from "@/lib/routing-types";
import type { AmLocale } from "@/lib/am-locale";
import { type AmContentV1, pickLocalized } from "@/lib/am-content";

const AmCatalogClient = dynamic(
    () => import("./AmCatalogClient").then((mod) => mod.AmCatalogClient),
    { ssr: true }
);

type Props = {
    tenantSlug: string;
    branchSlug: string;
    menu: MenuResponse;
    routingContext: RoutingContext;
    locale: AmLocale;
    amContent?: AmContentV1;
};

export function AmCatalogPage({ tenantSlug, branchSlug, menu, routingContext, locale, amContent }: Props) {
    const ui = amContent?.ui;
    const catalogUi = ui?.catalog;
    const productUi = ui?.product;
    const commonUi = ui?.common;
    const navUi = ui?.nav;
    const labels = {
        catalog: {
            archiveInventory: pickLocalized(catalogUi?.archiveInventory, locale, ""),
            titleAll: pickLocalized(catalogUi?.titleAll, locale, ""),
            categoryLabel: pickLocalized(catalogUi?.categoryLabel, locale, ""),
            sortBy: pickLocalized(catalogUi?.sortBy, locale, ""),
            viewGrid: pickLocalized(catalogUi?.viewGrid, locale, ""),
            viewList: pickLocalized(catalogUi?.viewList, locale, ""),
            sortOptions: {
                default: pickLocalized(catalogUi?.sortOptions?.default, locale, ""),
                newest: pickLocalized(catalogUi?.sortOptions?.newest, locale, ""),
                priceAsc: pickLocalized(catalogUi?.sortOptions?.priceAsc, locale, ""),
                priceDesc: pickLocalized(catalogUi?.sortOptions?.priceDesc, locale, ""),
                alphaAsc: pickLocalized(catalogUi?.sortOptions?.alphaAsc, locale, ""),
            },
            showingResults: pickLocalized(catalogUi?.showingResults, locale, ""),
            openSystem: pickLocalized(catalogUi?.openSystem, locale, ""),
            filters: {
                title: pickLocalized(catalogUi?.filters?.title, locale, ""),
                priceRange: pickLocalized(catalogUi?.filters?.priceRange, locale, ""),
                apply: pickLocalized(catalogUi?.filters?.apply, locale, ""),
                availability: pickLocalized(catalogUi?.filters?.availability, locale, ""),
                inStock: pickLocalized(catalogUi?.filters?.inStock, locale, ""),
                format: pickLocalized(catalogUi?.filters?.format, locale, ""),
                authors: pickLocalized(catalogUi?.filters?.authors, locale, ""),
                noResults: pickLocalized(catalogUi?.filters?.noResults, locale, ""),
            },
        },
        product: {
            addToCart: pickLocalized(productUi?.addToCart, locale, ""),
            makePreorder: pickLocalized(productUi?.makePreorder, locale, ""),
            preorder: pickLocalized(productUi?.preorder, locale, ""),
            new: pickLocalized(productUi?.new, locale, ""),
            bestseller: pickLocalized(productUi?.bestseller, locale, ""),
            outOfStock: pickLocalized(productUi?.outOfStock, locale, ""),
            format: {
                hardcover: pickLocalized(productUi?.format?.hardcover, locale, ""),
                paperback: pickLocalized(productUi?.format?.paperback, locale, ""),
                digital: pickLocalized(productUi?.format?.digital, locale, ""),
                specialEdition: pickLocalized(productUi?.format?.specialEdition, locale, ""),
            },
        },
        common: {
            noImage: pickLocalized(commonUi?.noImage, locale, ""),
            itemsLabel: pickLocalized(commonUi?.itemsLabel, locale, ""),
        },
        nav: {
            preorder: pickLocalized(navUi?.preorder, locale, ""),
        },
    };

    return (
        <AmCatalogClient
            tenantSlug={tenantSlug}
            branchSlug={branchSlug}
            menu={menu}
            routingContext={routingContext}
            labels={labels}
        />
    );
}
