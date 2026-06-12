import { getDefaultBranch, getJournalList, getTenantConfig } from "@/lib/data";
import { redirect } from "next/navigation";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import Link from "next/link";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { pickLocalized } from "@/lib/am-content";
import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";

function formatPublished(value: string | null, locale: string): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit", year: "numeric" }).format(d);
}

function IconBadge(props: { className?: string; strokeWidth?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={props.className}
            fill="none"
            stroke="currentColor"
            strokeWidth={props.strokeWidth ?? 1.5}
            aria-hidden="true"
        >
            <circle cx="12" cy="8" r="4" />
            <path d="M8.5 13.5 7 22l5-3 5 3-1.5-8.5" />
        </svg>
    );
}

function IconArrowRight(props: { className?: string; strokeWidth?: number }) {
    return (
        <svg
            viewBox="0 0 24 24"
            className={props.className}
            fill="none"
            stroke="currentColor"
            strokeWidth={props.strokeWidth ?? 1.6}
            aria-hidden="true"
        >
            <path d="M5 12h13" />
            <path d="m12 6 6 6-6 6" />
        </svg>
    );
}

export default async function JournalPage({
    params,
    searchParams,
}: {
    params: Promise<{ tenantSlug: string }>;
    searchParams?: Promise<{ cursor?: string }>;
}) {
    const { tenantSlug } = await params;
    const sp = (await searchParams) ?? {};
    const cursor = typeof sp.cursor === "string" && sp.cursor.length > 0 ? sp.cursor : undefined;
    const config = await getTenantConfig(tenantSlug);
    if (config.mainTemplate !== "berlin-press") {
        redirect(`/t/${tenantSlug}/main`);
    }
    const routingContext = await getRoutingContext();
    const { locale } = await getAmLocaleForTenant(tenantSlug);
    const [branch, list] = await Promise.all([
        getDefaultBranch(tenantSlug).catch(() => null),
        getJournalList(tenantSlug, { limit: 20, locale, cursor }),
    ]);
    const ui = config.amContent?.ui;
    const navUi = ui?.nav;
    const commonUi = ui?.common;
    const journalContent = config.amContent?.journal;
    const journalTitle = pickLocalized(journalContent?.title, locale, "") || "Journal";
    const journalSubtitle = pickLocalized(journalContent?.subtitle, locale, "");
    const journalTag = pickLocalized(navUi?.journalTag, locale, "");
    const homeCrumb = pickLocalized(navUi?.homeCrumb, locale, "");
    const itemsLabel = pickLocalized(commonUi?.itemsLabel, locale, "");
    const branchSlug = branch?.slug;
    const countPrefix = list.nextCursor ? `${list.items.length.toString().padStart(2, "0")}+` : list.items.length.toString().padStart(2, "0");
    return (
        <AmFullBleed>
            <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
            <main className="bg-paper min-h-screen pt-[60px] md:pt-[80px]">
                <section className="bg-ink text-paper py-20 md:py-28 relative overflow-hidden berlin-press-ink-noise border-b border-line">
                    <div className="max-w-7xl mx-auto px-6 text-center relative z-10 animate-fade-up">
                        <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-paper/60">{journalTag}</span>
                        <h1 className="text-4xl md:text-[54px] font-serif font-light mb-6 tracking-[-0.01em] leading-none break-words max-w-5xl mx-auto mt-4">
                            {journalTitle}
                        </h1>
                        <div className="flex justify-center">
                            <p className="text-paper/70 text-[15px] md:text-[17px] font-light max-w-3xl leading-[1.7] border-t border-paper/10 pt-6 tracking-[0.01em]">
                                {journalSubtitle}
                            </p>
                        </div>
                        <div className="mt-10">
                            <Link
                                href={tenantHref(routingContext, "/main")}
                                className="text-[10px] font-mono uppercase underline hover:text-accent transition-colors duration-300 tracking-[0.25em] text-paper/70"
                            >
                                ← {homeCrumb || "Home"}
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="pt-10 md:pt-14 pb-20 md:pb-24 relative overflow-hidden border-b border-line">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(17,18,20,0.06),transparent_60%)] pointer-events-none"></div>
                    <div className="max-w-7xl mx-auto px-6 relative z-10">
                        <div className="border-b border-line/30 pb-4 mb-10 flex items-center justify-between">
                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">{journalTag}</span>
                            <span className="font-mono text-[10px] uppercase tracking-[0.25em] text-muted">
                                {countPrefix} {itemsLabel}
                            </span>
                        </div>

                        {list.items.length === 0 ? (
                            <p className="text-muted text-sm text-center">No published posts yet.</p>
                        ) : (
                            <div className="space-y-6">
                                {list.items.map((n, idx) => {
                                    const dateLabel = formatPublished(n.publishedAt, locale);
                                    const href = tenantHref(routingContext, `/journal/${n.slug}`);
                                    return (
                                        <Link
                                            key={n.id}
                                            href={href}
                                            className="group block bg-paper/95 border border-line/30 px-6 md:px-8 py-8 md:py-9 min-h-[120px] md:min-h-[140px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_35px_rgba(6,14,30,0.12)] hover:border-line/60"
                                        >
                                            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                                                <div className="flex items-start gap-6">
                                                    <div className="w-11 h-11 rounded-full bg-bg border border-line/25 flex items-center justify-center text-ink/50 transition-colors duration-300 group-hover:bg-ink group-hover:text-paper">
                                                        <IconBadge className="w-[18px] h-[18px]" strokeWidth={1.25} />
                                                    </div>
                                                    <div>
                                                        <span className="text-[12px] md:text-[13px] uppercase tracking-[0.32em] text-accent font-medium">
                                                            {journalTag || "Journal"} {String(idx + 1).padStart(2, "0")}
                                                        </span>
                                                        <div className="mt-2 text-[18px] md:text-[22px] font-serif font-medium text-ink leading-snug transition-colors duration-300 group-hover:text-accent">
                                                            {n.title ?? "Untitled"}
                                                        </div>
                                                        {n.excerpt ? (
                                                            <p className="text-muted text-[12.5px] leading-relaxed max-w-2xl mt-3">
                                                                {n.excerpt}
                                                            </p>
                                                        ) : null}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-4 md:justify-end pl-[calc(2.75rem+1.5rem)] md:pl-0">
                                                    <span className="text-[12px] md:text-[13px] uppercase tracking-[0.22em] text-ink/60 font-mono">
                                                        {dateLabel}
                                                    </span>
                                                    <IconArrowRight className="w-4 h-4 text-ink/30 opacity-0 -translate-x-3 transition-all duration-300 group-hover:opacity-100 group-hover:text-ink/70 group-hover:translate-x-0" />
                                                </div>
                                            </div>
                                        </Link>
                                    );
                                })}
                            </div>
                        )}

                        {list.nextCursor ? (
                            <div className="mt-12 flex items-center justify-center">
                                <Link
                                    href={tenantHref(routingContext, `/journal?cursor=${encodeURIComponent(list.nextCursor)}`)}
                                    className="bg-ink text-paper px-10 py-4 text-[10px] font-bold uppercase tracking-[0.25em] hover:bg-accent hover:text-ink transition-colors border border-transparent hover:border-line duration-500"
                                >
                                    Load more
                                </Link>
                            </div>
                        ) : null}
                    </div>
                </section>
            </main>
      <AmFooter locale={locale} amContent={config.amContent} />
    </AmFullBleed>
  );
}
