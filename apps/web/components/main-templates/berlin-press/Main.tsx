import { HomePage } from "./HomePage";
import { AmHeader } from "./Header";
import { AmFooter } from "./Footer";
import { AmFullBleed } from "./FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { getDefaultBranch, getJournalHome, getMenuItems, getTenantConfig } from "@/lib/data";
import { getRoutingContext } from "@/lib/routing-context";
import type { LocalizedValue } from "@/lib/am-content";
import { tenantHref } from "@/lib/routing-helpers";

export default async function BerlinPressMainTemplate({ tenantSlug, branchSlug, amContent }: { tenantSlug: string; branchSlug?: string; amContent?: unknown }) {
    const branchPromise = branchSlug
        ? Promise.resolve({ slug: branchSlug })
        : getDefaultBranch(tenantSlug).catch(() => null);
    const [{ locale }, config, routingContext, branch] = await Promise.all([
        getAmLocaleForTenant(tenantSlug),
        getTenantConfig(tenantSlug),
        getRoutingContext(),
        branchPromise,
    ]);
    const content = (amContent ?? config.amContent) as typeof config.amContent;
    const resolvedBranchSlug = branch?.slug;
    const menuItemsPayload = resolvedBranchSlug ? await getMenuItems(resolvedBranchSlug, tenantSlug, locale) : { items: [] };

    const journalHome = await getJournalHome(tenantSlug, { locale }).catch(() => ({ items: [] }));
    const dateFmt = new Intl.DateTimeFormat(
        locale === "de" ? "de-DE" : "en-US",
        { month: "short", day: "2-digit", year: "numeric" }
    );
    const toLocalized = (value: string): LocalizedValue => ({ [locale]: value } as LocalizedValue);
    const journalItems = journalHome.items
        .filter((it) => it.title && it.publishedAt)
        .sort((a, b) => (a.homeSlot ?? 999) - (b.homeSlot ?? 999))
        .map((it) => ({
            id: it.id,
            href: tenantHref(routingContext, `/journal/${it.slug}`),
            date: it.publishedAt ? toLocalized(dateFmt.format(new Date(it.publishedAt))) : undefined,
            title: it.title ? toLocalized(it.title) : undefined,
        }));

    return (
        <AmFullBleed>
            <AmHeader tenantSlug={tenantSlug} branchSlug={resolvedBranchSlug} amContent={content} />
            <HomePage
                tenantSlug={tenantSlug}
                branchSlug={resolvedBranchSlug}
                items={menuItemsPayload.items}
                journalItems={journalItems.length ? journalItems : undefined}
                locale={locale}
                amContent={content}
                routingContext={routingContext}
            />
            <AmFooter locale={locale} amContent={content} />
        </AmFullBleed>
    );
}
