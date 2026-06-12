import Link from "next/link";
import type { AmLocale } from "@/lib/am-locale";
import { type AmContentV1, pickLocalized } from "@/lib/am-content";
import { getRoutingContext } from "@/lib/routing-context";
import { tenantHref } from "@/lib/routing-helpers";

function IconSend(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M22 2L11 13" />
            <path d="M22 2l-7 20-4-9-9-4 20-7z" />
        </svg>
    );
}

function IconInstagram(props: { className?: string }) {
    return (
        <svg viewBox="0 0 24 24" className={props.className} fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="5" ry="5" />
            <circle cx="12" cy="12" r="4" />
            <circle cx="17" cy="7" r="1.25" />
        </svg>
    );
}

type Props = {
    locale?: AmLocale;
    amContent?: AmContentV1;
};

export async function AmFooter({ locale = "de", amContent }: Props) {
    const routingContext = await getRoutingContext();
    const hrefFor = (suffix: string) => tenantHref(routingContext, suffix);
    const footer = amContent?.footer;
    const brandTitle = pickLocalized(footer?.brandTitle, locale, "");
    const brandText = pickLocalized(footer?.brandText, locale, "");
    const directoryTitle = pickLocalized(footer?.directoryTitle, locale, "");
    const subscribeTitle = pickLocalized(footer?.subscribeTitle, locale, "");
    const subscribeSpan = pickLocalized(footer?.subscribeSpan, locale, "");
    const emailPlaceholder = pickLocalized(footer?.emailPlaceholder, locale, "");
    const submitLabel = pickLocalized(footer?.submitLabel, locale, "");
    const socialTitle = pickLocalized(footer?.socialTitle, locale, "");
    const copyright = pickLocalized(footer?.copyright, locale, "");
    const directoryLinks = footer?.directoryLinks ?? [];
    const socialLinks = (footer?.socialLinks ?? []).filter((link) => link.id !== "arena");
    const legalLinks = footer?.legalLinks ?? [];
    const craftedLabel = "Crafted by Vendora";
    const craftedHref = "https://vendora-web.github.io/";

    return (
        <footer className="bg-ink text-paper berlin-press-ink-surface">
            <div
                className="grid grid-cols-1 md:grid-cols-[1.75fr_1fr_1fr_1fr] min-h-[400px]"
                style={{ boxShadow: "inset 0 2px 0 rgba(255,255,255,0.075)" }}
            >
                <div className="p-10 border-b md:border-b-0 md:border-r md:border-r-2 border-[rgba(255,255,255,0.075)] flex flex-col justify-between">
                    <div>
                        <h2 className="text-6xl font-serif mb-6 leading-none">{brandTitle}</h2>
                        <p className="font-mono text-xs leading-relaxed max-w-[36ch] whitespace-pre-line opacity-60">
                            {brandText}
                        </p>
                    </div>
                    <div className="mt-12">
                        <span className="block text-[10px] uppercase tracking-widest opacity-40 mb-2">
                            {socialTitle}
                        </span>
                        <div className="flex flex-col gap-2 font-mono text-xs">
                            {socialLinks.map((link) => {
                                const Icon = link.id === "instagram" ? IconInstagram : IconSend;
                                return (
                                    <a
                                        key={link.id}
                                        href={link.externalHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="hover:text-accent flex items-center gap-2"
                                    >
                                        <Icon className="w-3 h-3" /> {pickLocalized(link.label, locale, "")} -&gt;
                                    </a>
                                );
                            })}
                        </div>
                    </div>
                </div>

                <div className="p-10 border-b md:border-b-0 md:border-r md:border-r-2 border-[rgba(255,255,255,0.075)]">
                    <h3 className="font-bold text-xs uppercase tracking-widest mb-8 text-accent">
                        {directoryTitle}
                    </h3>
                    <ul className="space-y-4 font-serif text-2xl">
                        {directoryLinks.map((link) => (
                            <li key={link.id}>
                                <Link href={hrefFor(link.href)} className="hover:text-accent transition-all">
                                    {pickLocalized(link.label, locale, "")}
                                </Link>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="col-span-1 md:col-span-2 p-10 flex flex-col justify-center border-t md:border-t-0 border-[rgba(255,255,255,0.075)] md:border-t-0">
                    <h3 className="text-4xl md:text-5xl font-serif mb-8 max-w-lg leading-tight">
                        {subscribeTitle}<br />{" "}
                        <span className="text-accent italic">{subscribeSpan}</span>
                    </h3>
                    <form className="flex border-b border-paper/40 pb-2">
                        <input
                            type="email"
                            placeholder={emailPlaceholder}
                            className="bg-transparent w-full outline-none text-xl font-mono uppercase placeholder:text-paper/20"
                        />
                        <button type="submit" className="uppercase font-bold text-xs tracking-widest hover:text-accent">
                            {submitLabel}
                        </button>
                    </form>
                </div>
            </div>

            <div className="border-t border-t-2 border-paper/15 p-4 flex flex-col md:flex-row justify-between items-center text-[9px] uppercase tracking-widest font-mono opacity-50 gap-4 md:gap-0">
                <span className="flex items-center gap-2">
                    <span>{copyright}</span>
                    <span aria-hidden="true">•</span>
                    <a href={craftedHref} target="_blank" rel="noopener noreferrer" className="hover:text-paper hover:opacity-100 transition-opacity">
                        {craftedLabel}
                    </a>
                </span>
                <div className="flex gap-4">
                    {legalLinks.map((link) => (
                        <Link key={link.id} href={hrefFor(link.href)} className="hover:text-paper hover:opacity-100 transition-opacity">
                            {pickLocalized(link.label, locale, "")}
                        </Link>
                    ))}
                </div>
            </div>
        </footer>
    );
}
