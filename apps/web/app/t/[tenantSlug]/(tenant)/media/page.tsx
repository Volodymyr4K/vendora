import { redirect } from "next/navigation";
import { getTenantConfig, getDefaultBranch } from "@/lib/data";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { pickLocalized } from "@/lib/am-content";

function IconDownload(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M12 3v10" />
      <path d="m7 9 5 5 5-5" />
      <path d="M5 21h14" />
    </svg>
  );
}

function IconChat(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M7 8h10M7 12h6" />
      <path d="M21 12a8 8 0 0 1-8 8H6l-3 3V12a8 8 0 1 1 18 0z" />
    </svg>
  );
}

function IconUser(props: { className?: string; strokeWidth?: number }) {
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
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

function IconGlobe(props: { className?: string; strokeWidth?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={props.className}
      fill="none"
      stroke="currentColor"
      strokeWidth={props.strokeWidth ?? 1.5}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18" />
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

export default async function MediaPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
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

  const mediaContent = config.amContent?.media;
  const ui = config.amContent?.ui;
  const navUi = ui?.nav;
  const title = pickLocalized(mediaContent?.title, locale, "");
  const subtitle = pickLocalized(mediaContent?.subtitle, locale, "");
  const kitTitle = pickLocalized(mediaContent?.kitTitle, locale, "");
  const kitDesc = pickLocalized(mediaContent?.kitDesc, locale, "");
  const downloadText = pickLocalized(mediaContent?.downloadText, locale, "");
  const kitHref = mediaContent?.kitHref ?? "";
  const reviewTitle = pickLocalized(mediaContent?.reviewTitle, locale, "");
  const reviewDesc = pickLocalized(mediaContent?.reviewDesc, locale, "");
  const contactPrText = pickLocalized(mediaContent?.contactPrText, locale, "");
  const contactPrHref = mediaContent?.contactPrHref ?? "";
  const mentionsTitle = pickLocalized(mediaContent?.mentionsTitle, locale, "");

  const interviewTitle = pickLocalized(mediaContent?.interviewTitle, locale, "");
  const interviewDesc = pickLocalized(mediaContent?.interviewDesc, locale, "");
  const interviewCta = pickLocalized(mediaContent?.interviewCta, locale, "");
  const interviewHref = mediaContent?.interviewHref ?? "";

  const mentionItems = mediaContent?.mentions ?? [];
  const noResultsLabel = pickLocalized(navUi?.noResults, locale, "");
  const mentionsEnabled = mediaContent?.mentionsEnabled !== false;

  return (
    <AmFullBleed>
      <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
      <main className="bg-paper min-h-screen pt-[60px] md:pt-[80px]">
        <section className="bg-ink text-paper py-24 md:py-32 relative overflow-hidden berlin-press-ink-noise">
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10 animate-fade-up">
            <h1 className="text-4xl md:text-[54px] font-serif font-light mb-6 tracking-[-0.01em] leading-none break-words max-w-5xl mx-auto">
              {title}
            </h1>
            <div className="flex justify-center">
              <p className="text-paper/70 text-[15px] md:text-[17px] font-light max-w-3xl leading-[1.7] border-t border-paper/10 pt-6 tracking-[0.01em]">
                {subtitle}
              </p>
            </div>
          </div>
        </section>

        <section className="pt-20 md:pt-24 pb-12 md:pb-16 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(17,18,20,0.05),transparent_60%)] pointer-events-none"></div>
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              <div className="bg-paper border border-line/20 p-9 md:p-10 shadow-[0_18px_45px_rgba(6,14,30,0.08)] min-h-[290px] flex flex-col">
                <div className="w-10 h-10 rounded-full bg-bg border border-line/40 flex items-center justify-center text-ink/70 mb-6">
                  <IconDownload className="w-4 h-4" />
                </div>
                <h2 className="text-[18px] font-serif font-medium text-ink mb-3">{kitTitle}</h2>
                <p className="text-muted text-[12.5px] leading-relaxed">{kitDesc}</p>
                {kitHref ? (
                  <a
                    href={kitHref}
                    className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.32em] text-ink/70 border-b border-ink/30 pb-1 mt-auto pt-8 hover:text-ink hover:border-ink transition-colors"
                  >
                    {downloadText} →
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.32em] text-ink/40 border-b border-ink/10 pb-1 mt-auto pt-8 cursor-not-allowed">
                    {downloadText} →
                  </span>
                )}
              </div>
              <div className="bg-paper border border-line/20 p-9 md:p-10 shadow-[0_18px_45px_rgba(6,14,30,0.08)] min-h-[290px] flex flex-col">
                <div className="w-10 h-10 rounded-full bg-bg border border-line/40 flex items-center justify-center text-ink/70 mb-6">
                  <IconChat className="w-4 h-4" />
                </div>
                <h2 className="text-[18px] font-serif font-medium text-ink mb-3">{reviewTitle}</h2>
                <p className="text-muted text-[12.5px] leading-relaxed">{reviewDesc}</p>
                {contactPrHref ? (
                  <a
                    href={contactPrHref}
                    className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.32em] text-ink/70 border-b border-ink/30 pb-1 mt-auto pt-8 hover:text-ink hover:border-ink transition-colors"
                  >
                    {contactPrText} →
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.32em] text-ink/40 border-b border-ink/10 pb-1 mt-auto pt-8 cursor-not-allowed">
                    {contactPrText} →
                  </span>
                )}
              </div>
              <div className="bg-paper border border-line/20 p-9 md:p-10 shadow-[0_18px_45px_rgba(6,14,30,0.08)] min-h-[290px] flex flex-col">
                <div className="w-10 h-10 rounded-full bg-bg border border-line/40 flex items-center justify-center text-ink/70 mb-6">
                  <IconUser className="w-4 h-4" />
                </div>
                <h2 className="text-[18px] font-serif font-medium text-ink mb-3">{interviewTitle}</h2>
                <p className="text-muted text-[12.5px] leading-relaxed">{interviewDesc}</p>
                {interviewHref ? (
                  <a
                    href={interviewHref}
                    className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.32em] text-ink/70 border-b border-ink/30 pb-1 mt-auto pt-8 hover:text-ink hover:border-ink transition-colors"
                  >
                    {interviewCta} →
                  </a>
                ) : (
                  <span className="inline-flex items-center gap-2 text-[9px] uppercase tracking-[0.32em] text-ink/40 border-b border-ink/10 pb-1 mt-auto pt-8 cursor-not-allowed">
                    {interviewCta} →
                  </span>
                )}
              </div>
            </div>
            <div className="h-px w-full bg-line/30 mt-12"></div>
          </div>
        </section>

        {mentionsEnabled && (
        <section className="pt-8 md:pt-10 pb-20 md:pb-24 relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(17,18,20,0.06),transparent_60%)] pointer-events-none"></div>
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <h2 className="text-[20px] md:text-[24px] font-serif text-ink text-center mb-12">{mentionsTitle}</h2>

            {mentionItems.length === 0 ? (
              <p className="text-muted text-sm text-center">{noResultsLabel}</p>
            ) : (
              <div className="space-y-6">
                {mentionItems.map((item) => (
                  <a
                    key={item.id}
                    href={item.href ?? "#"}
                    className="group block bg-paper/95 border border-line/30 px-6 md:px-8 py-8 md:py-9 min-h-[120px] md:min-h-[140px] transition-all duration-300 hover:-translate-y-1 hover:shadow-[0_16px_35px_rgba(6,14,30,0.12)] hover:border-line/60"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                      <div className="flex items-start gap-6">
                        <div className="w-11 h-11 rounded-full bg-bg border border-line/25 flex items-center justify-center text-ink/50 transition-colors duration-300 group-hover:bg-ink group-hover:text-paper">
                          {item.icon === "globe" ? (
                            <IconGlobe className="w-[18px] h-[18px]" strokeWidth={1.25} />
                          ) : item.icon === "badge" ? (
                            <IconBadge className="w-[18px] h-[18px]" strokeWidth={1.25} />
                          ) : (
                            <IconUser className="w-[18px] h-[18px]" strokeWidth={1.25} />
                          )}
                        </div>
                        <div>
                          <span className="text-[12px] md:text-[13px] uppercase tracking-[0.32em] text-accent font-medium">
                            {pickLocalized(item.outlet, locale, "")}
                          </span>
                          <div className="mt-2 text-[16px] md:text-[18px] font-serif font-medium text-ink leading-snug transition-colors duration-300 group-hover:text-accent">
                            {pickLocalized(item.title, locale, "")}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-4 md:justify-end pl-[calc(2.75rem+1.5rem)] md:pl-0">
                        <span className="text-[12px] md:text-[13px] uppercase tracking-[0.22em] text-ink/60 font-mono">
                          {pickLocalized(item.date, locale, "")}
                        </span>
                        <IconArrowRight className="w-4 h-4 text-ink/30 opacity-0 -translate-x-3 transition-all duration-300 group-hover:opacity-100 group-hover:text-ink/70 group-hover:translate-x-0" />
                      </div>
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        </section>
        )}
      </main>
      <AmFooter locale={locale} amContent={config.amContent} />
    </AmFullBleed>
  );
}
