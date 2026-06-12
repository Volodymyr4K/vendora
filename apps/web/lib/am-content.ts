import type { AmLocale } from "@/lib/am-locale";

export type LocalizedValue = { de?: string; en?: string; ru?: string };

export type AmContentV1 = {
    version: 1;
    ui?: {
        common?: {
            noImage?: LocalizedValue;
            standard?: LocalizedValue;
            featured?: LocalizedValue;
            est?: LocalizedValue;
            close?: LocalizedValue;
            itemsLabel?: LocalizedValue;
            notificationLabel?: LocalizedValue;
        };
        nav?: {
            catalog?: LocalizedValue;
            authors?: LocalizedValue;
            about?: LocalizedValue;
            media?: LocalizedValue;
            preorder?: LocalizedValue;
            noResults?: LocalizedValue;
            homeCrumb?: LocalizedValue;
            journalTag?: LocalizedValue;
        };
        search?: {
            search?: LocalizedValue;
            recentSearches?: LocalizedValue;
            clearHistory?: LocalizedValue;
            emptyArchive?: LocalizedValue;
            trending?: LocalizedValue;
            quickLinks?: {
                philosophy?: LocalizedValue;
                art?: LocalizedValue;
                newest?: LocalizedValue;
            };
        };
        cart?: {
            yourOrder?: LocalizedValue;
            empty?: LocalizedValue;
            summary?: LocalizedValue;
            total?: LocalizedValue;
            remove?: LocalizedValue;
            itemNo?: LocalizedValue;
        };
        catalog?: {
            archiveInventory?: LocalizedValue;
            titleAll?: LocalizedValue;
            categoryLabel?: LocalizedValue;
            sortBy?: LocalizedValue;
            viewGrid?: LocalizedValue;
            viewList?: LocalizedValue;
            showingResults?: LocalizedValue;
            openSystem?: LocalizedValue;
            sortOptions?: {
                default?: LocalizedValue;
                newest?: LocalizedValue;
                priceAsc?: LocalizedValue;
                priceDesc?: LocalizedValue;
                alphaAsc?: LocalizedValue;
            };
            filters?: {
                title?: LocalizedValue;
                priceRange?: LocalizedValue;
                apply?: LocalizedValue;
                availability?: LocalizedValue;
                inStock?: LocalizedValue;
                format?: LocalizedValue;
                authors?: LocalizedValue;
                noResults?: LocalizedValue;
            };
        };
        product?: {
            addToCart?: LocalizedValue;
            makePreorder?: LocalizedValue;
            preorder?: LocalizedValue;
            new?: LocalizedValue;
            bestseller?: LocalizedValue;
            outOfStock?: LocalizedValue;
            byAuthor?: LocalizedValue;
            inStock?: LocalizedValue;
            details?: {
                year?: LocalizedValue;
                pages?: LocalizedValue;
            };
            youMayLike?: LocalizedValue;
            backToCatalog?: LocalizedValue;
            format?: {
                hardcover?: LocalizedValue;
                paperback?: LocalizedValue;
                digital?: LocalizedValue;
                specialEdition?: LocalizedValue;
            };
        };
    };
    header?: {
        brand?: {
            text?: LocalizedValue;
            logoUrl?: string;
        };
        nav?: { id: string; label?: LocalizedValue; href: string }[];
    };
    homepage?: {
        newArrivalsHeadingEnabled?: boolean;
        viewAllLinkEnabled?: boolean;
        hero?: {
            eyebrow?: LocalizedValue;
            title?: LocalizedValue;
            subtitle?: LocalizedValue;
            ctaText?: LocalizedValue;
            ctaHref?: string;
            imageUrl?: string;
            imageAlt?: LocalizedValue;
        };
        ticker?: { id: string; text: LocalizedValue }[];
        featured?: {
            label?: LocalizedValue;
            title?: LocalizedValue;
            href?: string;
        };
        stats?: { id: string; value: string; label: LocalizedValue }[];
        newArrivalsTitle?: LocalizedValue;
        marqueeVertical?: LocalizedValue;
        editorialTitle?: LocalizedValue;
        editorialDesc?: LocalizedValue;
        editorialImageUrl?: string;
        editorialImageAlt?: LocalizedValue;
        viewAllLabel?: LocalizedValue;
        viewAllHref?: string;
    };
    about?: {
        eyebrow?: LocalizedValue;
        title?: LocalizedValue;
        text?: LocalizedValue;
        missionTitle?: LocalizedValue;
        p1?: LocalizedValue;
        p2?: LocalizedValue;
        teamTitle?: LocalizedValue;
        hqLabel?: LocalizedValue;
        heroImageUrl?: string;
        heroImageAlt?: LocalizedValue;
        facts?: { id: string; value: string; label: LocalizedValue }[];
        teamMembers?: { id: string; name: LocalizedValue; role: LocalizedValue; imageUrl: string }[];
    };
    media?: {
        title?: LocalizedValue;
        subtitle?: LocalizedValue;
        kitTitle?: LocalizedValue;
        kitDesc?: LocalizedValue;
        downloadText?: LocalizedValue;
        kitHref?: string;
        reviewTitle?: LocalizedValue;
        reviewDesc?: LocalizedValue;
        contactPrText?: LocalizedValue;
        contactPrHref?: string;
        mentionsTitle?: LocalizedValue;
        interviewTitle?: LocalizedValue;
        interviewDesc?: LocalizedValue;
        interviewCta?: LocalizedValue;
        interviewHref?: string;
        mentionsEnabled?: boolean;
        mentions?: {
            id: string;
            outlet?: LocalizedValue | string;
            title?: LocalizedValue | string;
            date?: LocalizedValue | string;
            icon?: "globe" | "user" | "badge";
            href?: string;
        }[];
        items?: { id: string; name?: LocalizedValue; logoUrl: string; externalHref?: string }[];
    };
    legal?: {
        impressum?: {
            title?: LocalizedValue;
            subtitle?: LocalizedValue;
            bodyMarkdown?: LocalizedValue;
        };
        terms?: {
            title?: LocalizedValue;
            subtitle?: LocalizedValue;
            bodyMarkdown?: LocalizedValue;
        };
        privacy?: {
            title?: LocalizedValue;
            subtitle?: LocalizedValue;
            bodyMarkdown?: LocalizedValue;
        };
    };
    footer?: {
        brandTitle?: LocalizedValue;
        brandText?: LocalizedValue;
        directoryTitle?: LocalizedValue;
        directoryLinks?: { id: string; label: LocalizedValue; href: string }[];
        subscribeTitle?: LocalizedValue;
        subscribeSpan?: LocalizedValue;
        emailPlaceholder?: LocalizedValue;
        submitLabel?: LocalizedValue;
        socialTitle?: LocalizedValue;
        socialLinks?: { id: string; label: LocalizedValue; externalHref: string }[];
        legalLinks?: { id: string; label: LocalizedValue; href: string }[];
        copyright?: LocalizedValue | string;
    };
    journal?: {
        title?: LocalizedValue;
        subtitle?: LocalizedValue;
        items?: { id: string; date?: LocalizedValue; title?: LocalizedValue; preview?: LocalizedValue }[];
        archiveToast?: LocalizedValue;
    };
    authors?: {
        title?: LocalizedValue;
        subtitle?: LocalizedValue;
        manifestoLabel?: LocalizedValue;
        whatWePublishTitle?: LocalizedValue;
        p1?: LocalizedValue;
        p2?: LocalizedValue;
        proseTitle?: LocalizedValue;
        proseSub?: LocalizedValue;
        poetryTitle?: LocalizedValue;
        poetrySub?: LocalizedValue;
        essaysTitle?: LocalizedValue;
        essaysSub?: LocalizedValue;
        processTitle?: LocalizedValue;
        steps?: { id: string; title?: LocalizedValue; desc?: LocalizedValue }[];
        ctaText?: LocalizedValue;
        ctaSub?: LocalizedValue;
        ctaButtonText?: LocalizedValue;
        ctaNote?: LocalizedValue;
        ctaHref?: string;
    };
};

export function pickLocalized(value: LocalizedValue | string | undefined, locale: AmLocale, fallback: string): string {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    const direct = value[locale];
    if (direct) return direct;
    return value.de ?? value.en ?? value.ru ?? fallback;
}

export function pickLocalizedNoFallback(value: LocalizedValue | string | undefined, locale: AmLocale, fallback: string): string {
    if (!value) return fallback;
    if (typeof value === "string") return value;
    return value[locale] ?? fallback;
}

export function pickLocalizedOptional(value: LocalizedValue | string | undefined, locale: AmLocale): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    const direct = value[locale];
    return direct ?? value.de ?? value.en ?? value.ru;
}

export function pickLocalizedOptionalNoFallback(value: LocalizedValue | string | undefined, locale: AmLocale): string | undefined {
    if (!value) return undefined;
    if (typeof value === "string") return value;
    return value[locale];
}
