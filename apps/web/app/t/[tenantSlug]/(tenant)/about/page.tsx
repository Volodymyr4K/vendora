import { redirect } from "next/navigation";
import Image from "next/image";
import { getTenantConfig, getDefaultBranch } from "@/lib/data";
import { AmHeader } from "@/components/main-templates/berlin-press/Header";
import { AmFooter } from "@/components/main-templates/berlin-press/Footer";
import { AmFullBleed } from "@/components/main-templates/berlin-press/FullBleed";
import { getAmLocaleForTenant } from "@/lib/am-locale.server";
import { pickLocalized } from "@/lib/am-content";

export default async function AboutPage({ params }: { params: Promise<{ tenantSlug: string }> }) {
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
  const aboutContent = config.amContent?.about;
  const aboutTitle = pickLocalized(aboutContent?.title, locale, "");
  const aboutText = pickLocalized(aboutContent?.text, locale, "");
  const missionTitle = pickLocalized(aboutContent?.missionTitle, locale, "");
  const missionP1 = pickLocalized(aboutContent?.p1, locale, "");
  const missionP2 = pickLocalized(aboutContent?.p2, locale, "");
  const teamTitle = pickLocalized(aboutContent?.teamTitle, locale, "");
  const hqLabel = pickLocalized(aboutContent?.hqLabel, locale, "");
  const heroImageUrl = aboutContent?.heroImageUrl;
  const heroImageAlt = pickLocalized(aboutContent?.heroImageAlt, locale, "");
  const teamMembers = aboutContent?.teamMembers ?? [];
  const facts = aboutContent?.facts ?? [];

  return (
    <AmFullBleed>
      <AmHeader tenantSlug={tenantSlug} branchSlug={branchSlug} amContent={config.amContent} />
      <main className="bg-paper min-h-screen pt-[60px] md:pt-[80px]">
        {/* Hero */}
        <section className="bg-ink text-paper py-24 md:py-32 relative overflow-hidden berlin-press-ink-noise">
          <div className="max-w-7xl mx-auto px-6 text-center relative z-10 animate-fade-up">
            <h1 className="text-4xl md:text-[54px] font-serif font-light mb-6 tracking-[-0.01em] leading-none break-words max-w-5xl mx-auto">
              {aboutTitle}
            </h1>
            <div className="flex justify-center">
              <p className="text-paper/70 text-[15px] md:text-[17px] font-light max-w-3xl leading-[1.7] border-t border-paper/10 pt-6 tracking-[0.01em]">
                {aboutText}
              </p>
            </div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-6 py-16 md:py-24">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-16 lg:gap-24 items-center mb-24">
            <div className="order-2 md:order-1">
              <h2 className="text-3xl font-serif text-ink mb-8 text-center md:text-left">{missionTitle}</h2>
              <p className="text-muted leading-relaxed mb-6 font-light text-lg">
                {missionP1}
              </p>
              <p className="text-muted leading-relaxed font-light text-lg">
                {missionP2}
              </p>
              <div className="flex gap-12 mt-12 border-t border-line/40 pt-8">
                <div>
                  <span className="block text-4xl font-serif text-ink mb-2">{facts[0]?.value ?? ""}</span>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-muted">
                    {pickLocalized(facts[0]?.label, locale, "")}
                  </span>
                </div>
                <div>
                  <span className="block text-4xl font-serif text-ink mb-2">{facts[1]?.value ?? ""}</span>
                  <span className="text-[10px] uppercase tracking-[0.25em] text-muted">
                    {pickLocalized(facts[1]?.label, locale, "")}
                  </span>
                </div>
              </div>
            </div>

            <div className="order-1 md:order-2 bg-bg aspect-square md:aspect-[4/3] relative overflow-hidden group">
              {heroImageUrl ? (
                <>
                  <Image
                    src={heroImageUrl}
                    alt={heroImageAlt}
                    fill
                    priority
                    fetchPriority="high"
                    sizes="(min-width: 768px) 50vw, 100vw"
                    className="object-cover grayscale group-hover:grayscale-0 transition-all duration-[1500ms]"
                  />
                  <div className="absolute inset-0 bg-ink/10 mix-blend-multiply"></div>
                  <div className="absolute bottom-6 left-6 text-paper text-[10px] uppercase tracking-[0.25em] opacity-0 group-hover:opacity-100 transition-opacity">
                    {hqLabel}
                  </div>
                </>
              ) : null}
            </div>
          </div>

          <div className="bg-bg py-16 md:py-20 -mx-6 px-6 md:mx-0 rounded-sm">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-serif text-ink mb-4">{teamTitle}</h2>
              <div className="w-12 h-[1px] bg-accent mx-auto"></div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              {teamMembers.map((member) => (
                <div key={member.id} className="group text-center">
                  <div className="w-full aspect-[3/4] mx-auto mb-6 relative overflow-hidden bg-paper shadow-sm border border-line">
                    <Image
                      src={member.imageUrl}
                      alt={pickLocalized(member.name, locale, "")}
                      fill
                      sizes="(min-width: 768px) 25vw, 100vw"
                      className="object-cover grayscale contrast-125 group-hover:grayscale-0 transition-all duration-700"
                    />
                  </div>
                  <h4 className="font-serif text-xl text-ink">{pickLocalized(member.name, locale, "")}</h4>
                  <p className="text-[10px] uppercase tracking-[0.2em] text-accent mt-2 font-bold">{pickLocalized(member.role, locale, "")}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <AmFooter locale={locale} amContent={config.amContent} />
    </AmFullBleed>
  );
}
