import { redirect } from "next/navigation";
import { getTenantConfig, getDefaultBranch } from "@/lib/data";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { pickLocalized } from "@/lib/am-content";

function IconBookOpen(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M12 7v14" />
      <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z" />
    </svg>
  );
}

function IconPenTool(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z" />
      <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18" />
      <path d="m2.3 2.3 7.286 7.286" />
      <circle cx="11" cy="11" r="2" />
    </svg>
  );
}

function IconMail(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 7l9 6 9-6" />
    </svg>
  );
}

function IconClock(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  );
}

function IconFileText(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <line x1="16" x2="8" y1="13" y2="13" />
      <line x1="16" x2="8" y1="17" y2="17" />
      <line x1="10" x2="8" y1="9" y2="9" />
    </svg>
  );
}

function IconSend(props: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
      aria-hidden="true"
    >
      <path d="M22 2L11 13" />
      <path d="M22 2l-7 20-4-9-9-4 20-7z" />
    </svg>
  );
}

export default async function AuthorsPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await params;
  const config = await getTenantConfig(tenantSlug);
  if (config.mainTemplate !== "berlin-press") {
    redirect(`/t/${tenantSlug}/main`);
  }
  const [{ locale }, branch] = await Promise.all([
    getAmLocaleForTenant(tenantSlug),
    getDefaultBranch(tenantSlug).catch(() => null),
  ]);

  const authorsContent = config.amContent?.authors;
  const authorsTitle = pickLocalized(authorsContent?.title, locale, "");
  const authorsSubtitle = pickLocalized(authorsContent?.subtitle, locale, "");
  const manifestoLabel = pickLocalized(authorsContent?.manifestoLabel, locale, "");
  const whatWePublishTitle = pickLocalized(authorsContent?.whatWePublishTitle, locale, "");
  const p1 = pickLocalized(authorsContent?.p1, locale, "");
  const p2 = pickLocalized(authorsContent?.p2, locale, "");
  const proseTitle = pickLocalized(authorsContent?.proseTitle, locale, "");
  const proseSub = pickLocalized(authorsContent?.proseSub, locale, "");
  const poetryTitle = pickLocalized(authorsContent?.poetryTitle, locale, "");
  const poetrySub = pickLocalized(authorsContent?.poetrySub, locale, "");
  const processTitle = pickLocalized(authorsContent?.processTitle, locale, "");
  const steps = authorsContent?.steps ?? [];
  const ctaText = pickLocalized(authorsContent?.ctaText, locale, "");
  const ctaSub = pickLocalized(authorsContent?.ctaSub, locale, "");
  const ctaButtonText = pickLocalized(authorsContent?.ctaButtonText, locale, "");
  const ctaNote = pickLocalized(authorsContent?.ctaNote, locale, "");
  const ctaHref = authorsContent?.ctaHref;

  const branchSlug = branch?.slug;

  return (
    <AmFullBleed>
      <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
      <main className="min-h-screen pt-[60px] md:pt-[80px]">
        {/* Header */}
        <section className="bg-ink text-paper py-24 md:py-32 relative overflow-hidden berlin-press-ink-surface">
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10 animate-fade-up">
            <h1 className="text-4xl md:text-[54px] font-serif font-light mb-6 tracking-[-0.01em] leading-none break-words max-w-5xl mx-auto">
              {authorsTitle}
            </h1>
            <div className="flex justify-center">
              <p className="text-paper/70 text-[15px] md:text-[17px] font-light max-w-3xl leading-[1.7] border-t border-paper/10 pt-6 tracking-[0.01em]">
                {authorsSubtitle}
              </p>
            </div>
          </div>
        </section>

        {/* Manifesto / Intro */}
        <section className="py-24 bg-paper relative overflow-hidden">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(17,18,20,0.05),transparent_55%),radial-gradient(circle_at_80%_30%,rgba(17,18,20,0.04),transparent_50%)] pointer-events-none"></div>
          <div className="max-w-7xl mx-auto px-6 relative z-10">
            <div className="grid !grid-cols-1 md:!grid-cols-12 !gap-12 lg:!gap-20 items-start">
              <div className="md:col-span-7">
                <span className="text-accent text-[10px] font-bold uppercase tracking-[0.35em] mb-5 block flex items-center gap-3">
                  <span className="w-8 h-[1px] bg-accent/80"></span> {manifestoLabel}
                </span>
                <h2 className="text-4xl md:text-[42px] font-serif font-light text-ink mb-8 leading-[1.12] tracking-[-0.01em]">
                  {whatWePublishTitle}
                </h2>
                <div className="space-y-6 text-muted/80 font-normal text-[15px] md:text-[15.5px] leading-[1.88] md:pr-12">
                  <p>{p1}</p>
                  <p>{p2}</p>
                </div>
              </div>

              <div className="md:col-span-5 grid !grid-cols-1 !gap-6">
                <div className="bg-white/80 backdrop-blur-[1px] px-10 py-8 border border-line/40 hover:border-line/70 transition-all duration-500 group relative overflow-hidden shadow-[0_10px_30px_rgba(17,18,20,0.06)]">
                  <div className="absolute top-0 right-0 p-6 opacity-15 group-hover:opacity-25 transition-opacity">
                    <IconBookOpen className="w-16 h-16 text-ink/30" />
                  </div>
                  <h3 className="font-serif text-[19px] font-light mb-2 text-ink relative z-10">{proseTitle}</h3>
                  <p className="text-[10px] text-muted uppercase tracking-[0.32em] relative z-10">{proseSub}</p>
                </div>
                <div className="berlin-press-ink-surface text-paper px-10 py-8 transition-all duration-500 group relative overflow-hidden shadow-[0_14px_40px_rgba(6,14,30,0.25)]">
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_0%,rgba(255,255,255,0.06),transparent_45%)] opacity-70"></div>
                  <div className="absolute top-0 right-0 p-6 opacity-15 group-hover:opacity-25 transition-opacity">
                    <IconPenTool className="w-16 h-16 text-paper/40" />
                  </div>
                  <h3 className="font-serif text-[19px] font-light mb-2 relative z-10">{poetryTitle}</h3>
                  <p className="text-[10px] text-paper/60 uppercase tracking-[0.32em] relative z-10">{poetrySub}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Submission Process */}
        <section className="bg-paper py-24 border-t border-line/40">
          <div className="max-w-7xl mx-auto px-6">
            <div className="flex flex-col md:flex-row justify-between items-center md:items-end mb-16 gap-6">
              <h2 className="text-3xl md:text-4xl font-serif text-ink text-center md:text-left">{processTitle}</h2>
              <div className="h-[1px] flex-1 bg-line/40 mx-8 hidden md:block"></div>
            </div>

            <div className="grid !grid-cols-1 md:!grid-cols-3 !gap-0 border-l border-t border-line/40">
              {steps.map((step, idx) => (
                <div key={step.id} className="relative p-12 bg-paper border-r border-b border-line/40 hover:bg-bg transition-colors group">
                  <div className="flex justify-between items-start mb-6">
                    <span className="text-4xl font-serif text-accent/70 group-hover:text-accent transition-colors">
                      {String(idx + 1).padStart(2, "0")}
                    </span>
                    {idx === 0 ? (
                      <IconFileText className="w-5 h-5 text-line group-hover:text-ink transition-colors" />
                    ) : null}
                    {idx === 1 ? (
                      <IconMail className="w-5 h-5 text-line group-hover:text-ink transition-colors" />
                    ) : null}
                    {idx === 2 ? (
                      <IconClock className="w-5 h-5 text-line group-hover:text-ink transition-colors" />
                    ) : null}
                  </div>
                  <h3 className="text-xl font-serif text-ink mb-4 relative z-10">
                    {pickLocalized(step.title, locale, "")}
                  </h3>
                  <p className="text-sm text-ink/70 leading-relaxed relative z-10 font-normal">
                    {pickLocalized(step.desc, locale, "")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-24">
          <div className="max-w-7xl mx-auto px-6">
            <div className="bg-ink text-paper px-8 py-20 md:px-20 md:py-24 text-center relative overflow-hidden isolate">
              <div className="absolute inset-0 bg-gradient-to-br from-ink via-ink to-[#162a47] z-[-1]"></div>
              <div className="relative z-10 max-w-2xl mx-auto">
                <h2 className="text-3xl md:text-5xl font-serif mb-8">{ctaText}</h2>
                <p className="text-paper/70 mb-12 font-light text-lg">{ctaSub}</p>
                {ctaHref && ctaButtonText ? (
                  <a
                    href={ctaHref}
                    className="inline-flex items-center gap-4 bg-paper text-ink px-10 py-5 uppercase tracking-[0.2em] text-xs font-bold hover:bg-accent hover:text-paper transition-all duration-300 shadow-2xl hover:-translate-y-1"
                  >
                    <IconSend className="w-4 h-4" /> {ctaButtonText}
                  </a>
                ) : null}
                {ctaNote ? <p className="mt-10 text-[10px] text-paper/60 uppercase tracking-widest">{ctaNote}</p> : null}
              </div>
            </div>
          </div>
        </section>
      </main>
      <AmFooter locale={locale} amContent={config.amContent} />
    </AmFullBleed>
  );
}
