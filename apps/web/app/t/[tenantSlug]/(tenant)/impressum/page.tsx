import { redirect } from "next/navigation";
import { getDefaultBranch, getTenantConfig } from "@/lib/data";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { pickLocalizedNoFallback } from "@/lib/am-content";
import { renderJournalMarkdownToHtml } from "@vendora/shared";
import { LEGAL_TEMPLATES } from "@/lib/legal-templates";

export default async function TenantImpressumPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const config = await getTenantConfig(tenantSlug);
  if (config.mainTemplate !== "berlin-press") {
    redirect(`/t/${tenantSlug}/main`);
  }

  const [{ locale }, branch] = await Promise.all([
    getAmLocaleForTenant(tenantSlug),
    getDefaultBranch(tenantSlug).catch(() => null),
  ]);
  const branchSlug = branch?.slug;
  const t = LEGAL_TEMPLATES.impressum[locale];
  const legal = config.amContent?.legal?.impressum;
  const overrideTitle = pickLocalizedNoFallback(legal?.title, locale, "");
  const overrideSubtitle = pickLocalizedNoFallback(legal?.subtitle, locale, "");
  const overrideMarkdown = pickLocalizedNoFallback(legal?.bodyMarkdown, locale, "");
  const useOverride = Boolean(
    (overrideMarkdown && overrideMarkdown.trim().length > 0) ||
      (overrideTitle && overrideTitle.trim().length > 0) ||
      (overrideSubtitle && overrideSubtitle.trim().length > 0)
  );
  const overrideHtml =
    useOverride && overrideMarkdown.trim().length > 0
      ? await renderJournalMarkdownToHtml(overrideMarkdown)
      : "";

  return (
    <AmFullBleed>
      <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
      <main className="bg-paper min-h-screen pt-[60px] md:pt-[80px]">
        <section className="bg-ink text-paper py-20 md:py-24 relative overflow-hidden berlin-press-ink-noise">
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10">
            <h1 className="text-4xl md:text-[54px] font-serif font-light mb-6 tracking-[-0.01em] leading-none">
              {useOverride ? (overrideTitle || t.title) : t.title}
            </h1>
            <p className="text-paper/70 text-[15px] md:text-[17px] font-light max-w-3xl leading-[1.7] mx-auto border-t border-paper/10 pt-6 tracking-[0.01em]">
              {useOverride ? (overrideSubtitle || t.subtitle) : t.subtitle}
            </p>
          </div>
        </section>

        <section className="max-w-5xl mx-auto px-6 py-14 md:py-20">
          <div className="bg-bg border border-line shadow-sm p-8 md:p-12">
            {useOverride && overrideHtml ? (
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
                dangerouslySetInnerHTML={{ __html: overrideHtml }}
              />
            ) : (
              <>
                <p className="text-muted leading-relaxed text-[15px] md:text-[16px]">
                  {t.intro}
                </p>

                <div className="mt-10 border-t border-line/40 pt-10 space-y-10">
                  {t.blocks.map((block) => (
                    <div key={block.title} className="border border-line bg-paper p-6">
                      <h2 className="text-xl md:text-2xl font-serif text-ink mb-4">{block.title}</h2>
                      <div className="space-y-1 text-[15px] md:text-[16px] text-ink/90">
                        {block.lines.map((line) => (
                          <div key={line}>{line}</div>
                        ))}
                      </div>
                    </div>
                  ))}

                  <p className="text-muted leading-relaxed text-[14px] md:text-[15px]">
                    {t.note}
                  </p>
                  <p className="text-[10px] uppercase tracking-[0.25em] text-muted font-mono">
                    {t.updated}
                  </p>
                </div>
              </>
            )}
          </div>
        </section>
      </main>
      <AmFooter locale={locale} amContent={config.amContent} />
    </AmFullBleed>
  );
}
