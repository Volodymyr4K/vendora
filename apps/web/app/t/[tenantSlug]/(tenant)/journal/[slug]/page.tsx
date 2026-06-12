import { getDefaultBranch, getJournalPostBySlug, getTenantConfig } from "@/lib/data";
import { redirect, notFound } from "next/navigation";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";
import Link from "next/link";
import { renderJournalMarkdownToHtml } from "@vendora/shared";
import { pickLocalized } from "@/lib/am-content";

function formatPublished(value: string | null, locale: string): string {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "";
    return new Intl.DateTimeFormat(locale, { month: "short", day: "2-digit", year: "numeric" }).format(d);
}

export default async function JournalPostPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; slug: string }>;
}) {
    const { tenantSlug, slug } = await params;
    const config = await getTenantConfig(tenantSlug);
    if (config.mainTemplate !== "berlin-press") {
        redirect(`/t/${tenantSlug}/main`);
    }

    const routingContext = await getRoutingContext();
    const { locale } = await getAmLocaleForTenant(tenantSlug);
    const [branch, post] = await Promise.all([
        getDefaultBranch(tenantSlug).catch(() => null),
        getJournalPostBySlug(tenantSlug, slug, { locale }),
    ]);

    if (!post) return notFound();

    const html = await renderJournalMarkdownToHtml(post.markdown);
    const published = formatPublished(post.publishedAt, locale);
    const branchSlug = branch?.slug;
    const ui = config.amContent?.ui;
    const navUi = ui?.nav;
    const journalTag = pickLocalized(navUi?.journalTag, locale, "") || "Journal";

    return (
        <AmFullBleed>
            <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
            <main className="bg-paper min-h-screen pt-[60px] md:pt-[80px]">
                <section className="bg-ink text-paper py-18 md:py-24 relative overflow-hidden berlin-press-ink-noise border-b border-line">
                    <div className="max-w-7xl mx-auto px-6 relative z-10 animate-fade-up">
                        <div className="flex items-center justify-between gap-6 flex-wrap">
                            <Link
                                href={tenantHref(routingContext, "/journal")}
                                className="text-[10px] font-mono uppercase underline hover:text-accent transition-colors duration-300 tracking-[0.25em] text-paper/70"
                            >
                                ← {journalTag}
                            </Link>
                            {published ? (
                                <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-paper/60">
                                    {published}
                                </span>
                            ) : null}
                        </div>

                        <h1 className="text-4xl md:text-[54px] font-serif font-light tracking-[-0.01em] leading-none break-words max-w-5xl mt-8">
                            {post.title}
                        </h1>
                        {post.excerpt ? (
                            <p className="text-paper/70 text-[15px] md:text-[17px] font-light max-w-3xl leading-[1.7] border-t border-paper/10 pt-6 mt-6 tracking-[0.01em]">
                                {post.excerpt}
                            </p>
                        ) : null}
                    </div>
                </section>

                {post.coverImageKey ? (
                    <section className="border-b border-line">
                        <div className="max-w-7xl mx-auto px-6 py-10 md:py-12">
                            <img
                                src={`/media/${post.coverImageKey}`}
                                alt=""
                                className="w-full max-h-[560px] object-cover border border-line shadow-[0_18px_45px_rgba(6,14,30,0.08)]"
                            />
                        </div>
                    </section>
                ) : null}

                <section className="border-b border-line">
                    <div className="max-w-7xl mx-auto px-6 py-10 md:py-12">
                        <div
                            className={[
                                "max-w-3xl text-ink",
                                "font-serif",
                                "[&_p]:text-[16px] [&_p]:leading-relaxed [&_p]:text-ink/80 [&_p]:mb-5",
                                "[&_h1]:text-4xl [&_h1]:leading-tight [&_h1]:mb-6",
                                "[&_h2]:text-3xl [&_h2]:leading-tight [&_h2]:mb-5 [&_h2]:mt-10",
                                "[&_h3]:text-2xl [&_h3]:leading-tight [&_h3]:mb-4 [&_h3]:mt-8",
                                "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-6",
                                "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-6",
                                "[&_li]:mb-2",
                                "[&_a]:underline [&_a]:decoration-ink/30 hover:[&_a]:decoration-accent hover:[&_a]:text-accent transition-colors",
                                "[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink/70 [&_blockquote]:my-6",
                                "[&_hr]:border-line [&_hr]:my-10",
                                "[&_code]:font-mono [&_code]:text-[13px] [&_code]:bg-line/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
                                "[&_pre]:bg-ink [&_pre]:text-paper [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-8",
                            ].join(" ")}
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    </div>
                </section>
            </main>
            <AmFooter locale={locale} amContent={config.amContent} />
        </AmFullBleed>
    );
}
