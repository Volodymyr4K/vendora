"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { AmContentV1 } from "@/lib/am-content";
import { AM_CONTENT_DEFAULTS } from "@/lib/am-content-defaults";
import { LEGAL_TEMPLATES } from "@/lib/legal-templates";
import { getAmLocaleCookieName } from "@/lib/am-locale";
import { getAdminContentAction, renderJournalMarkdownPreviewAction, updateAdminContentAction, uploadFileAction } from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { AccessDeniedBlock } from "../AccessDeniedBlock";
import { useAdminContext } from "../AdminContext";

const MODULE_ID = "admin_content";

const DEFAULT_CONTENT: AmContentV1 = AM_CONTENT_DEFAULTS;
const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp";
const LOCALES = ["de", "en"] as const;

function LegalMarkdownEditor(props: {
    tenantSlug: string;
    pageKey: "impressum" | "terms" | "privacy";
    lang: (typeof LOCALES)[number];
    value: string;
    templateValue: string;
    textareaClass: string;
    onChange: (next: string) => void;
}) {
    const { value, textareaClass, onChange } = props;
    const textareaRef = useRef<HTMLTextAreaElement | null>(null);
    const [html, setHtml] = useState<string>("");
    const [loading, setLoading] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);

    useEffect(() => {
        let cancelled = false;
        setPreviewError(null);
        setLoading(true);
        const t = window.setTimeout(async () => {
            try {
                const rendered = await renderJournalMarkdownPreviewAction(value);
                if (cancelled) return;
                setHtml(rendered);
            } catch (e: unknown) {
                if (cancelled) return;
                setPreviewError(e instanceof Error ? e.message : "Preview failed");
                setHtml("");
            } finally {
                if (!cancelled) setLoading(false);
            }
        }, 350);
        return () => {
            cancelled = true;
            window.clearTimeout(t);
        };
    }, [value]);

    const applySnippet = (snippet: string) => {
        const el = textareaRef.current;
        if (!el) {
            onChange(`${value}${value.endsWith("\n") ? "" : "\n"}${snippet}`);
            return;
        }
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? start;
        const before = value.slice(0, start);
        const after = value.slice(end);
        const next = `${before}${snippet}${after}`;
        onChange(next);
        requestAnimationFrame(() => {
            try {
                el.focus();
                const caret = start + snippet.length;
                el.setSelectionRange(caret, caret);
            } catch {
                // ignore
            }
        });
    };

    return (
        <div className="mt-2">
            <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="text-[10px] uppercase tracking-[0.22em] text-muted">Quick insert</span>
                <button type="button" className="text-xs px-2 py-1 border border-line rounded hover:bg-bg" onClick={() => applySnippet("\n## Section title\n")}>
                    Heading
                </button>
                <button type="button" className="text-xs px-2 py-1 border border-line rounded hover:bg-bg" onClick={() => applySnippet("\n- Item 1\n- Item 2\n")}>
                    List
                </button>
                <button type="button" className="text-xs px-2 py-1 border border-line rounded hover:bg-bg" onClick={() => applySnippet("[link text](https://example.com)")}>
                    Link
                </button>
                <button type="button" className="text-xs px-2 py-1 border border-line rounded hover:bg-bg" onClick={() => applySnippet("\n---\n")}>
                    Divider
                </button>
                <button type="button" className="text-xs px-2 py-1 border border-line rounded hover:bg-bg" onClick={() => onChange("")}>
                    Reset text
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted mb-1">Markdown</div>
                    <textarea
                        ref={textareaRef}
                        value={value}
                        onChange={(e) => onChange(e.target.value)}
                        className={textareaClass}
                        spellCheck={false}
                    />
                    <div className="mt-1 text-[10px] text-muted">
                        Tip: edit the text like a document. Links look like <span className="font-mono">[text](https://...)</span>. To revert to the template, delete everything or click Reset.
                    </div>
                </div>
                <div>
                    <div className="text-[10px] uppercase tracking-[0.22em] text-muted mb-1">
                        Preview {loading ? <span className="ml-2 text-muted">(updating…)</span> : null}
                    </div>
                    {previewError ? (
                        <div className="text-xs text-danger border border-line rounded p-3 bg-paper">
                            Preview error: {previewError}
                        </div>
                    ) : (
                        <div
                            className={[
                                "border border-line rounded p-3 bg-paper",
                                "max-w-none text-ink",
                                "font-serif",
                                "[&_p]:text-[14px] [&_p]:leading-relaxed [&_p]:text-ink/80 [&_p]:mb-4",
                                "[&_h1]:text-3xl [&_h1]:leading-tight [&_h1]:mb-5",
                                "[&_h2]:text-2xl [&_h2]:leading-tight [&_h2]:mb-4 [&_h2]:mt-8",
                                "[&_h3]:text-xl [&_h3]:leading-tight [&_h3]:mb-3 [&_h3]:mt-6",
                                "[&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-5",
                                "[&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-5",
                                "[&_li]:mb-2",
                                "[&_a]:underline [&_a]:decoration-ink/30 hover:[&_a]:decoration-accent hover:[&_a]:text-accent transition-colors",
                                "[&_blockquote]:border-l-2 [&_blockquote]:border-line [&_blockquote]:pl-4 [&_blockquote]:italic [&_blockquote]:text-ink/70 [&_blockquote]:my-5",
                                "[&_hr]:border-line [&_hr]:my-8",
                                "[&_code]:font-mono [&_code]:text-[12px] [&_code]:bg-line/40 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded",
                                "[&_pre]:bg-ink [&_pre]:text-paper [&_pre]:p-4 [&_pre]:rounded [&_pre]:overflow-x-auto [&_pre]:my-6",
                            ].join(" ")}
                            dangerouslySetInnerHTML={{ __html: html }}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

function ImageUrlField(props: {
    label: string;
    value?: string;
    onChange: (next: string | undefined) => void;
    tenantSlug: string;
    disabled?: boolean;
    required?: boolean;
    className?: string;
    inputClass: string;
    placeholder?: string;
    helperText?: string;
}) {
    const { label, value, onChange, tenantSlug, disabled, required, className, inputClass, placeholder, helperText } = props;
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [uploading, setUploading] = useState(false);
    const [uploadError, setUploadError] = useState<string | null>(null);

    const canUpload = Boolean(tenantSlug) && !disabled;
    const url = (value ?? "").trim();
    const showPreview = url.length > 0 && (url.startsWith("/media/") || url.startsWith("/uploads/") || url.startsWith("https://"));

    const startPick = () => {
        if (!canUpload) return;
        setUploadError(null);
        fileInputRef.current?.click();
    };

    const onPickFile = async (file: File | null) => {
        if (!file) return;
        if (!canUpload) return;
        setUploadError(null);
        setUploading(true);
        try {
            const formData = new FormData();
            formData.append("file", file);
            const res = await uploadFileAction(formData, tenantSlug);
            const nextUrl = (res?.urlPath || res?.url || "").trim();
            if (!nextUrl) {
                throw new Error("Upload succeeded but server returned empty url");
            }
            onChange(nextUrl);
        } catch (e: unknown) {
            setUploadError(e instanceof Error ? e.message : "Upload failed");
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = "";
        }
    };

    return (
        <div className={className}>
            <div className="flex items-center justify-between gap-3">
                <div className="text-xs">{label}</div>
                <div className="flex items-center gap-2">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept={IMAGE_ACCEPT}
                        className="hidden"
                        onChange={(e) => onPickFile(e.target.files?.[0] ?? null)}
                        disabled={!canUpload || uploading}
                    />
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg disabled:opacity-50"
                        onClick={startPick}
                        disabled={!canUpload || uploading}
                        title="Upload from your computer (stored in R2 when configured; served under /media/...)"
                    >
                        {uploading ? "Uploading…" : "Upload"}
                    </button>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg disabled:opacity-50"
                        onClick={() => onChange(undefined)}
                        disabled={!canUpload || uploading || !url || Boolean(required)}
                        title="Clear this image"
                    >
                        Clear
                    </button>
                </div>
            </div>
            <input
                value={value ?? ""}
                onChange={(e) => onChange(e.target.value || undefined)}
                className={inputClass}
                placeholder={placeholder}
                disabled={Boolean(disabled)}
            />
            {uploadError ? <div className="mt-1 text-[11px] text-danger">{uploadError}</div> : null}
            {showPreview ? (
                <div className="mt-2 flex items-center gap-3">
                    <img
                        src={url}
                        alt=""
                        className="block h-16 w-16 rounded border border-line object-cover bg-bg"
                        loading="lazy"
                    />
                    <a
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] underline text-muted hover:text-ink"
                    >
                        Open image
                    </a>
                </div>
            ) : null}
            {helperText ? (
                <div className="mt-1 text-[10px] text-muted">{helperText}</div>
            ) : null}
        </div>
    );
}

export default function AdminContentPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; branchSlug: string }>;
}) {
    const { canEdit } = useAdminContext();
    const canEditContent = canEdit(MODULE_ID);

    const [tenantSlug, setTenantSlug] = useState("");
    const [branchSlug, setBranchSlug] = useState("");
    const [jsonValue, setJsonValue] = useState("");
    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [lastSaved, setLastSaved] = useState<string | null>(null);
    const hasUnsavedChanges = lastSaved !== null && lastSaved !== jsonValue;
    const previewHref = (path: string) => `/t/${tenantSlug}${path}`;
    const [compact, setCompact] = useState(false);
    const cardPaddingClass = compact ? "p-2" : "p-3";
    const inputClass = compact ? "mt-1 w-full rounded border border-line px-2 py-1 text-[11px]" : "mt-1 w-full rounded border border-line px-2 py-1 text-xs";
    const textareaClass = compact
        ? "mt-1 w-full rounded border border-line px-2 py-1 text-[11px] font-mono min-h-[140px]"
        : "mt-1 w-full rounded border border-line px-2 py-1 text-xs font-mono min-h-[200px]";
    const cookieNameForPrivacy = tenantSlug ? getAmLocaleCookieName(tenantSlug) : "";
    const [legalLang, setLegalLang] = useState<Record<"impressum" | "terms" | "privacy", (typeof LOCALES)[number]>>({
        impressum: "de",
        terms: "de",
        privacy: "de",
    });

    const legalTemplateMarkdown = (key: "impressum" | "terms" | "privacy", lang: "de" | "en"): string => {
        if (key === "impressum") {
            const t = LEGAL_TEMPLATES.impressum[lang];
            const parts: string[] = [];
            parts.push(`# ${t.title}`);
            parts.push(`_${t.subtitle}_`);
            parts.push(t.intro);
            for (const b of t.blocks) {
                parts.push(`## ${b.title}`);
                parts.push(b.lines.join("\n"));
            }
            parts.push(`---\n\n${t.note}`);
            parts.push(`\n\n*${t.updated}*`);
            return parts.join("\n\n");
        }
        if (key === "terms") {
            const t = LEGAL_TEMPLATES.terms[lang];
            const parts: string[] = [];
            parts.push(`# ${t.title}`);
            parts.push(`_${t.subtitle}_`);
            parts.push(t.intro);
            for (const s of t.sections) {
                parts.push(`## ${s.title}`);
                parts.push(s.body);
            }
            parts.push(`\n\n*${t.updated}*`);
            return parts.join("\n\n");
        }
        const t = LEGAL_TEMPLATES.privacy[lang];
        const name = cookieNameForPrivacy || "<cookie-name>";
        const parts: string[] = [];
        parts.push(`# ${t.title}`);
        parts.push(`_${t.subtitle}_`);
        parts.push(t.intro);
        parts.push(`## ${t.cookiesTitle}`);
        parts.push(t.cookiesIntro);
        parts.push(`- **Name:** ${name}`);
        parts.push(`- **${t.cookiesPurpose}:** ${t.cookiesPurposeValue}`);
        parts.push(`- **${t.cookiesType}:** ${t.cookiesTypeValue}`);
        parts.push(`- **${t.cookiesLifetime}:** ${t.cookiesLifetimeValue}`);
        parts.push(`---\n\n${t.note}`);
        parts.push(`\n\n*${t.updated}*`);
        return parts.join("\n\n");
    };


    useEffect(() => {
        params.then((p) => {
            setTenantSlug(p.tenantSlug);
            setBranchSlug(p.branchSlug);
            load(p.tenantSlug);
        });
    }, [params]);

    async function load(ts: string) {
        setLoading(true);
        setError(null);
        setAccessDenied(false);
        try {
            const res = await getAdminContentAction(ts);
            const value = res?.amContent ?? DEFAULT_CONTENT;
            setJsonValue(JSON.stringify(value, null, 2));
            setLastSaved(JSON.stringify(value, null, 2));
        } catch (e: unknown) {
            if (e instanceof Error && e.message === ACCESS_DENIED_MESSAGE) {
                setAccessDenied(true);
            } else {
                setError(e instanceof Error ? e.message : "Failed to load content");
            }
        } finally {
            setLoading(false);
        }
    }

    function validateJson(raw: string): AmContentV1 {
        let parsed: unknown;
        try {
            parsed = JSON.parse(raw);
        } catch {
            throw new Error("Invalid JSON");
        }
        const content = parsed as AmContentV1;

        const LOCALE_KEYS = ["de", "en"] as const;
        const isLocalizedValueObject = (value: unknown): value is Record<string, unknown> => {
            if (!value || typeof value !== "object" || Array.isArray(value)) return false;
            const keys = Object.keys(value as Record<string, unknown>);
            if (keys.length === 0) return false;
            return keys.every((k) => (LOCALE_KEYS as readonly string[]).includes(k));
        };

        const stripEmptyLocalized = (value: unknown): unknown => {
            if (Array.isArray(value)) {
                return value.map(stripEmptyLocalized).filter((v) => v !== undefined);
            }
            if (!value || typeof value !== "object") return value;
            if (isLocalizedValueObject(value)) {
                const out: Record<string, string> = {};
                for (const k of LOCALE_KEYS) {
                    const v = (value as Record<string, unknown>)[k];
                    if (typeof v === "string" && v.trim().length > 0) out[k] = v;
                }
                return Object.keys(out).length > 0 ? out : undefined;
            }
            const obj = value as Record<string, unknown>;
            const next: Record<string, unknown> = {};
            for (const [k, v] of Object.entries(obj)) {
                const cleaned = stripEmptyLocalized(v);
                if (cleaned !== undefined) next[k] = cleaned;
            }
            return next;
        };

        const cleaned = stripEmptyLocalized(content) as AmContentV1 | undefined;
        if (!cleaned) throw new Error("Invalid content payload");
        const items = cleaned?.media?.items ?? [];
        for (const item of items) {
            if (!item.logoUrl || (!item.logoUrl.startsWith("/uploads/") && !item.logoUrl.startsWith("/media/") && !item.logoUrl.startsWith("https://"))) {
                throw new Error("media.items.logoUrl must start with /uploads/, /media/, or https://");
            }
            if (item.externalHref && !item.externalHref.startsWith("https://")) {
                throw new Error("media.items.externalHref must start with https://");
            }
        }
        const footer = cleaned?.footer;
        const directoryLinks = footer?.directoryLinks ?? [];
        for (const link of directoryLinks) {
            if (!link.href || !link.href.startsWith("/")) {
                throw new Error("footer.directoryLinks.href must start with /");
            }
        }
        const legalLinks = footer?.legalLinks ?? [];
        for (const link of legalLinks) {
            if (!link.href || !link.href.startsWith("/")) {
                throw new Error("footer.legalLinks.href must start with /");
            }
        }
        const socialLinks = footer?.socialLinks ?? [];
        for (const link of socialLinks) {
            if (!link.externalHref || !link.externalHref.startsWith("https://")) {
                throw new Error("footer.socialLinks.externalHref must start with https://");
            }
        }
        const heroHref = cleaned?.homepage?.hero?.ctaHref;
        if (heroHref && !heroHref.startsWith("/")) {
            throw new Error("homepage.hero.ctaHref must start with /");
        }
        const heroImageUrl = cleaned?.homepage?.hero?.imageUrl;
        if (heroImageUrl && !heroImageUrl.startsWith("/uploads/") && !heroImageUrl.startsWith("/media/") && !heroImageUrl.startsWith("https://")) {
            throw new Error("homepage.hero.imageUrl must start with /uploads/, /media/, or https://");
        }
        const headerLogoUrl = cleaned?.header?.brand?.logoUrl;
        if (headerLogoUrl && !headerLogoUrl.startsWith("/uploads/") && !headerLogoUrl.startsWith("/media/") && !headerLogoUrl.startsWith("https://")) {
            throw new Error("header.brand.logoUrl must start with /uploads/, /media/, or https://");
        }
        const headerNav = cleaned?.header?.nav ?? [];
        for (const link of headerNav) {
            if (!link.href || !link.href.startsWith("/")) {
                throw new Error("header.nav.href must start with /");
            }
        }
        const viewAllHref = cleaned?.homepage?.viewAllHref;
        if (viewAllHref && !viewAllHref.startsWith("/")) {
            throw new Error("homepage.viewAllHref must start with /");
        }
        const editorialImageUrl = cleaned?.homepage?.editorialImageUrl;
        if (editorialImageUrl && !editorialImageUrl.startsWith("/uploads/") && !editorialImageUrl.startsWith("/media/") && !editorialImageUrl.startsWith("https://")) {
            throw new Error("homepage.editorialImageUrl must start with /uploads/, /media/, or https://");
        }
        const mentions = cleaned?.media?.mentions ?? [];
        for (const mention of mentions) {
            if (mention.href && !mention.href.startsWith("/") && !mention.href.startsWith("https://") && !mention.href.startsWith("#")) {
                throw new Error("media.mentions.href must start with /, https://, or #");
            }
            if (mention.icon && !["globe", "user", "badge"].includes(mention.icon)) {
                throw new Error("media.mentions.icon must be globe, user, or badge");
            }
        }
        const isMediaCtaHrefAllowed = (href: string): boolean => {
            const h = href.trim();
            if (!h) return false;
            if (h.startsWith("/")) return true;
            if (h.startsWith("https://")) return true;
            if (h.startsWith("mailto:")) return true;
            if (h.startsWith("tel:")) return true;
            return false;
        };
        const kitHref = cleaned?.media?.kitHref;
        if (kitHref && !isMediaCtaHrefAllowed(kitHref)) {
            throw new Error("media.kitHref must start with /, https://, mailto:, or tel:");
        }
        const contactPrHref = cleaned?.media?.contactPrHref;
        if (contactPrHref && !isMediaCtaHrefAllowed(contactPrHref)) {
            throw new Error("media.contactPrHref must start with /, https://, mailto:, or tel:");
        }
        const interviewHref = cleaned?.media?.interviewHref;
        if (interviewHref && !isMediaCtaHrefAllowed(interviewHref)) {
            throw new Error("media.interviewHref must start with /, https://, mailto:, or tel:");
        }
        const aboutHeroImageUrl = cleaned?.about?.heroImageUrl;
        if (aboutHeroImageUrl && !aboutHeroImageUrl.startsWith("/uploads/") && !aboutHeroImageUrl.startsWith("/media/") && !aboutHeroImageUrl.startsWith("https://")) {
            throw new Error("about.heroImageUrl must start with /uploads/, /media/, or https://");
        }
        const teamMembers = cleaned?.about?.teamMembers ?? [];
        for (const member of teamMembers) {
            if (!member.imageUrl || (!member.imageUrl.startsWith("/uploads/") && !member.imageUrl.startsWith("/media/") && !member.imageUrl.startsWith("https://"))) {
                throw new Error("about.teamMembers.imageUrl must start with /uploads/, /media/, or https://");
            }
        }
        return cleaned;
    }

    const onSave = () => {
        if (!canEditContent) return;
        setError(null);
        startTransition(async () => {
            try {
                const payload = validateJson(jsonValue);
                await updateAdminContentAction(branchSlug, tenantSlug, payload);
                setLastSaved(jsonValue);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to save content");
            }
        });
    };

    const onValidate = () => {
        try {
            validateJson(jsonValue);
            setError("✓ Valid JSON");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Invalid JSON");
        }
    };

    const onReset = () => {
        if (!lastSaved) return;
        setJsonValue(lastSaved);
        setError(null);
    };

    const onResetDefaults = () => {
        if (!window.confirm("Reset all content to defaults? This will clear all overrides.")) return;
        setJsonValue(JSON.stringify(DEFAULT_CONTENT, null, 2));
        setError(null);
    };

    const onResetSection = (section: keyof Omit<AmContentV1, "version">) => {
        if (!parsedDraft) return;
        if (!window.confirm(`Reset ${section} to defaults?`)) return;
        const base = parsedDraft ?? { version: 1 };
        const next: AmContentV1 = {
            ...base,
            [section]: (DEFAULT_CONTENT as AmContentV1)[section],
        };
        setDraft(next);
        try {
            validateJson(JSON.stringify(next));
            setError("✓ Valid JSON");
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : "Invalid JSON");
        }
    };

    if (accessDenied) return <AccessDeniedBlock />;

    const parsedDraft = useMemo(() => {
        try {
            return JSON.parse(jsonValue) as AmContentV1;
        } catch {
            return null;
        }
    }, [jsonValue]);

    type MediaItems = NonNullable<NonNullable<AmContentV1["media"]>["items"]>;
    type MediaItem = MediaItems[number];
    type MediaMentions = NonNullable<NonNullable<AmContentV1["media"]>["mentions"]>;
    type MediaMention = MediaMentions[number];
    type HeaderNavItems = NonNullable<NonNullable<AmContentV1["header"]>["nav"]>;
    type HeaderNavItem = HeaderNavItems[number];

    const mediaItems: MediaItems = parsedDraft?.media?.items ?? [];
    const mediaMentions: MediaMentions = parsedDraft?.media?.mentions ?? [];
    const headerNavItems: HeaderNavItems = parsedDraft?.header?.nav ?? [];
    const isBerlinTenant = tenantSlug === "berlin-press";
    const showHints = isBerlinTenant;
    const sectionHint = (text: string) =>
        showHints ? (
            <div className="text-[10px] text-muted mb-2 leading-snug">{text}</div>
        ) : null;
    const orderStyle = (order: number) => (isBerlinTenant ? { order } : undefined);
    const swapByIndex = <T,>(items: T[], from: number, to: number): T[] => {
        if (from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
        const next = [...items];
        const current = next[from];
        const target = next[to];
        if (current === undefined || target === undefined) return items;
        next[from] = target;
        next[to] = current;
        return next;
    };

    const setDraft = (next: AmContentV1) => {
        setJsonValue(JSON.stringify(next, null, 2));
    };

    const updateMediaItems = (nextItems: MediaItems) => {
        const base = parsedDraft ?? { version: 1 };
        const next: AmContentV1 = {
            ...base,
            media: {
                ...(base.media ?? {}),
                items: nextItems ?? [],
            },
        };
        setDraft(next);
    };

    const updateMediaMentions = (nextMentions: MediaMentions) => {
        const base = parsedDraft ?? { version: 1 };
        const next: AmContentV1 = {
            ...base,
            media: {
                ...(base.media ?? {}),
                mentions: nextMentions ?? [],
            },
        };
        setDraft(next);
    };

    const addMediaItem = () => {
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}`;
        updateMediaItems([
            ...mediaItems,
            { id, name: {}, logoUrl: "https://", externalHref: "https://" },
        ]);
    };

    const addMediaMention = () => {
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `mention-${Date.now()}`;
        updateMediaMentions([
            ...mediaMentions,
            { id, outlet: {}, title: {}, date: {}, icon: "globe", href: "https://" },
        ]);
    };

    const updateHeaderNav = (nextNav: HeaderNavItems) => {
        const base = parsedDraft ?? { version: 1 };
        setDraft({
            ...base,
            header: {
                ...(base.header ?? {}),
                nav: nextNav ?? [],
            },
        });
    };

    const addHeaderNavItem = () => {
        const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `nav-${Date.now()}`;
        updateHeaderNav([
            ...headerNavItems,
            { id, label: {}, href: "/" },
        ]);
    };

    const updateHeaderNavItem = (id: string, patch: Partial<HeaderNavItem>) => {
        updateHeaderNav(headerNavItems.map((item) => (item.id === id ? { ...item, ...patch } : item)));
    };

    const moveHeaderNavItem = (id: string, direction: -1 | 1) => {
        const idx = headerNavItems.findIndex((item) => item.id === id);
        if (idx < 0) return;
        const target = idx + direction;
        if (target < 0 || target >= headerNavItems.length) return;
        const next = swapByIndex(headerNavItems, idx, target);
        updateHeaderNav(next);
    };

    const removeHeaderNavItem = (id: string) => {
        updateHeaderNav(headerNavItems.filter((item) => item.id !== id));
    };

    const updateMediaItem = (id: string, patch: Partial<MediaItem>) => {
        updateMediaItems(
            mediaItems.map((item) => (item.id === id ? { ...item, ...patch } : item))
        );
    };

    const updateMediaMention = (id: string, patch: Partial<MediaMention>) => {
        updateMediaMentions(
            mediaMentions.map((item) => (item.id === id ? { ...item, ...patch } : item))
        );
    };

    const moveMediaItem = (id: string, direction: -1 | 1) => {
        const idx = mediaItems.findIndex((item) => item.id === id);
        if (idx < 0) return;
        const target = idx + direction;
        if (target < 0 || target >= mediaItems.length) return;
        const next = swapByIndex(mediaItems, idx, target);
        updateMediaItems(next);
    };

    const moveMediaMention = (id: string, direction: -1 | 1) => {
        const idx = mediaMentions.findIndex((item) => item.id === id);
        if (idx < 0) return;
        const target = idx + direction;
        if (target < 0 || target >= mediaMentions.length) return;
        const next = swapByIndex(mediaMentions, idx, target);
        updateMediaMentions(next);
    };

    const removeMediaItem = (id: string) => {
        updateMediaItems(mediaItems.filter((item) => item.id !== id));
    };

    const removeMediaMention = (id: string) => {
        updateMediaMentions(mediaMentions.filter((item) => item.id !== id));
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: compact ? 8 : 16 }}>
            {!canEditContent && (
                <div className="bg-warning-weak text-warning" style={{ padding: "10px 14px", borderRadius: 8 }}>
                    Read-only: you can view content but not edit it.
                </div>
            )}
            <div className="sticky top-0 z-10 bg-paper/95 backdrop-blur border-b border-line py-2">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <h2>Content</h2>
                        {hasUnsavedChanges ? (
                            <span className="text-xs text-warning">Unsaved changes</span>
                        ) : (
                            <span className="text-xs text-muted">Saved</span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={onValidate}
                        className="rounded-md border border-line px-3 py-2 text-xs hover:bg-bg"
                    >
                        Validate
                    </button>
                    <label className="flex items-center gap-2 text-xs text-muted">
                        <input
                            type="checkbox"
                            checked={compact}
                            onChange={(e) => setCompact(e.target.checked)}
                        />
                        Compact
                    </label>
                    <button
                        type="button"
                        onClick={onReset}
                        disabled={!lastSaved}
                        className="rounded-md border border-line px-3 py-2 text-xs hover:bg-bg disabled:opacity-50"
                    >
                        Reset
                    </button>
                    <button
                        type="button"
                        onClick={onResetDefaults}
                        className="rounded-md border border-line px-3 py-2 text-xs hover:bg-bg"
                    >
                        Reset defaults
                    </button>
                        <button
                            type="button"
                            disabled={!canEditContent || isPending}
                            onClick={onSave}
                            className="rounded-md bg-ink text-paper px-4 py-2 text-sm disabled:opacity-50"
                        >
                            {isPending ? "Saving..." : "Save"}
                        </button>
                    </div>
                </div>
            </div>

            {showHints && (
                <div className="rounded-md border border-line bg-paper p-3 text-[10px] text-muted leading-snug">
                    Tips: Use /path for internal links and https://... for external links. Image URLs can be /uploads/..., /media/..., or https://... . Use {`{count}`} where shown to display a number.
                </div>
            )}

            {loading && <div style={{ padding: 12, color: "var(--muted)" }}>Loading content...</div>}
            {error && (
                <div
                    className={error.startsWith("✓") ? "bg-green-50 text-green-800" : "bg-danger-weak text-danger"}
                    style={{ padding: 12, borderRadius: 8 }}
                >
                    {error}
                </div>
            )}

            <details className="mt-4 rounded-md border border-line bg-paper p-4" style={orderStyle(90)}>
                <summary className="cursor-pointer text-sm font-semibold">Advanced: raw amContent (JSON)</summary>
                {sectionHint("Advanced only. Edit the full content as JSON. Use only if you are comfortable with JSON.")}
                <div className="mt-3">
                    <label className="text-sm text-muted">amContent (JSON)</label>
                    <textarea
                        value={jsonValue}
                        onChange={(e) => setJsonValue(e.target.value)}
                        spellCheck={false}
                        style={{
                            minHeight: compact ? 260 : 420,
                            fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
                            fontSize: compact ? 11 : 12,
                            padding: compact ? 8 : 12,
                            borderRadius: 8,
                            border: "1px solid var(--line)",
                            background: "var(--paper)",
                            color: "var(--ink)",
                        }}
                    />
                </div>
            </details>

            {isBerlinTenant ? (
                <>
                    <div className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted" style={orderStyle(5)}>
                        Site Chrome
                    </div>
                    <div className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted" style={orderStyle(35)}>
                        Home
                    </div>
                    <div className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted" style={orderStyle(45)}>
                        Catalog
                    </div>
                    <div className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted" style={orderStyle(65)}>
                        Content Pages
                    </div>
                    <div className="mt-6 text-[11px] uppercase tracking-[0.22em] text-muted" style={orderStyle(85)}>
                        Advanced
                    </div>
                </>
            ) : null}

            {isBerlinTenant ? (
                <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(20)}>
                    <summary className="cursor-pointer text-sm font-semibold">Global UI</summary>
                    <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">UI: common</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Common labels used across the site.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit common labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-noimage-${lang}`} className="text-xs">
                                No Image ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.noImage?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    noImage: { ...(base.ui?.common?.noImage ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-standard-${lang}`} className="text-xs">
                                Standard ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.standard?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    standard: { ...(base.ui?.common?.standard ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-featured-${lang}`} className="text-xs">
                                Featured ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.featured?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    featured: { ...(base.ui?.common?.featured ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-est-${lang}`} className="text-xs">
                                Est ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.est?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    est: { ...(base.ui?.common?.est ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-close-${lang}`} className="text-xs">
                                Close ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.close?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    close: { ...(base.ui?.common?.close ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-items-${lang}`} className="text-xs">
                                Items label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.itemsLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    itemsLabel: { ...(base.ui?.common?.itemsLabel ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-common-notification-${lang}`} className="text-xs">
                                Notification label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.common?.notificationLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                common: {
                                                    ...(base.ui?.common ?? {}),
                                                    notificationLabel: { ...(base.ui?.common?.notificationLabel ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">UI: navigation labels</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Menu text shown in the main navigation.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit navigation labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-catalog-${lang}`} className="text-xs">
                                Catalog ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.catalog?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    catalog: { ...(base.ui?.nav?.catalog ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-authors-${lang}`} className="text-xs">
                                Authors ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.authors?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    authors: { ...(base.ui?.nav?.authors ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-about-${lang}`} className="text-xs">
                                About ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.about?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    about: { ...(base.ui?.nav?.about ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-media-${lang}`} className="text-xs">
                                Media ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.media?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    media: { ...(base.ui?.nav?.media ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-preorder-${lang}`} className="text-xs">
                                Preorder ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.preorder?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    preorder: { ...(base.ui?.nav?.preorder ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-noresults-${lang}`} className="text-xs">
                                No Results ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.noResults?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    noResults: { ...(base.ui?.nav?.noResults ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-homecrumb-${lang}`} className="text-xs">
                                Home Crumb ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.homeCrumb?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    homeCrumb: { ...(base.ui?.nav?.homeCrumb ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-nav-journaltag-${lang}`} className="text-xs">
                                Journal Tag ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.nav?.journalTag?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                nav: {
                                                    ...(base.ui?.nav ?? {}),
                                                    journalTag: { ...(base.ui?.nav?.journalTag ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">UI: search</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Text used inside the search panel.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit search labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-search-${lang}`} className="text-xs">
                                Search ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.search?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    search: { ...(base.ui?.search?.search ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-recent-${lang}`} className="text-xs">
                                Recent Searches ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.recentSearches?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    recentSearches: { ...(base.ui?.search?.recentSearches ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-clear-${lang}`} className="text-xs">
                                Clear History ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.clearHistory?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    clearHistory: { ...(base.ui?.search?.clearHistory ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-empty-${lang}`} className="text-xs">
                                Empty Archive ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.emptyArchive?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    emptyArchive: { ...(base.ui?.search?.emptyArchive ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-trending-${lang}`} className="text-xs">
                                Trending ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.trending?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    trending: { ...(base.ui?.search?.trending ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-quick-philosophy-${lang}`} className="text-xs">
                                Quick Link: Philosophy ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.quickLinks?.philosophy?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    quickLinks: {
                                                        ...(base.ui?.search?.quickLinks ?? {}),
                                                        philosophy: { ...(base.ui?.search?.quickLinks?.philosophy ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-quick-art-${lang}`} className="text-xs">
                                Quick Link: Art ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.quickLinks?.art?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    quickLinks: {
                                                        ...(base.ui?.search?.quickLinks ?? {}),
                                                        art: { ...(base.ui?.search?.quickLinks?.art ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-search-quick-new-${lang}`} className="text-xs">
                                Quick Link: Newest ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.search?.quickLinks?.newest?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                search: {
                                                    ...(base.ui?.search ?? {}),
                                                    quickLinks: {
                                                        ...(base.ui?.search?.quickLinks ?? {}),
                                                        newest: { ...(base.ui?.search?.quickLinks?.newest ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">UI: cart</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Text shown in the cart panel.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit cart labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-cart-yourorder-${lang}`} className="text-xs">
                                Your Order ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.cart?.yourOrder?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                cart: {
                                                    ...(base.ui?.cart ?? {}),
                                                    yourOrder: { ...(base.ui?.cart?.yourOrder ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-cart-empty-${lang}`} className="text-xs">
                                Empty ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.cart?.empty?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                cart: {
                                                    ...(base.ui?.cart ?? {}),
                                                    empty: { ...(base.ui?.cart?.empty ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-cart-summary-${lang}`} className="text-xs">
                                Summary ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.cart?.summary?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                cart: {
                                                    ...(base.ui?.cart ?? {}),
                                                    summary: { ...(base.ui?.cart?.summary ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-cart-total-${lang}`} className="text-xs">
                                Total ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.cart?.total?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                cart: {
                                                    ...(base.ui?.cart ?? {}),
                                                    total: { ...(base.ui?.cart?.total ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-cart-remove-${lang}`} className="text-xs">
                                Remove ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.cart?.remove?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                cart: {
                                                    ...(base.ui?.cart ?? {}),
                                                    remove: { ...(base.ui?.cart?.remove ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-cart-itemno-${lang}`} className="text-xs">
                                Item No ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.cart?.itemNo?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                cart: {
                                                    ...(base.ui?.cart ?? {}),
                                                    itemNo: { ...(base.ui?.cart?.itemNo ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>
                    </div>
                </details>
            ) : null}

            {isBerlinTenant ? (
                <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(10)}>
                    <summary className="cursor-pointer text-sm font-semibold">Header & Navigation</summary>
                    <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Header: brand</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("header")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Brand text and logo shown in the header.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit header brand.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`header-brand-text-${lang}`} className="text-xs">
                                Brand Text ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.header?.brand?.text?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            header: {
                                                ...(base.header ?? {}),
                                                brand: {
                                                    ...(base.header?.brand ?? {}),
                                                    text: { ...(base.header?.brand?.text ?? {}), [lang]: e.target.value || undefined },
                                                    logoUrl: base.header?.brand?.logoUrl,
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <ImageUrlField
                            className="text-xs md:col-span-3"
                            label="Logo URL"
                            value={parsedDraft.header?.brand?.logoUrl}
                            onChange={(next) => {
                                const base = parsedDraft ?? { version: 1 };
                                setDraft({
                                    ...base,
                                    header: {
                                        ...(base.header ?? {}),
                                        brand: {
                                            ...(base.header?.brand ?? {}),
                                            logoUrl: next,
                                        },
                                    },
                                });
                            }}
	                            tenantSlug={tenantSlug}
	                            disabled={!canEditContent || !parsedDraft}
	                            inputClass={inputClass}
	                            placeholder="https://... or /uploads/... or /media/..."
	                            helperText="Upload from your computer (stored in R2 when configured). Result URL will be under /media/…"
	                        />
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Header: navigation</h3>
                    <button
                        type="button"
                        onClick={addHeaderNavItem}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add item
                    </button>
                </div>
                {sectionHint("Each item is a menu link. Use /path for internal pages.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit navigation.</div>
                )}
                {parsedDraft && headerNavItems.length === 0 && (
                    <div className="text-xs text-muted mt-2">No navigation items yet.</div>
                )}
                {parsedDraft && headerNavItems.length > 0 && (
                    <div className="mt-3 space-y-3">
                        {headerNavItems.map((item, index) => (
                            <div key={item.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {item.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => moveHeaderNavItem(item.id, -1)}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => moveHeaderNavItem(item.id, 1)}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => removeHeaderNavItem(item.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="text-xs">
                                        Href (/...)
                                        <input
                                            value={item.href ?? ""}
                                            onChange={(e) => updateHeaderNavItem(item.id, { href: e.target.value })}
                                            className={inputClass}
                                            placeholder="/catalog"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-label-${lang}`} className="text-xs">
                                            Label ({lang.toUpperCase()})
                                            <input
                                                value={item.label?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    updateHeaderNavItem(item.id, {
                                                        label: { ...(item.label ?? {}), [lang]: e.target.value || undefined },
                                                    });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                    </div>
                </details>
            ) : null}

            {isBerlinTenant ? (
                <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(50)}>
                    <summary className="cursor-pointer text-sm font-semibold">Catalog UI</summary>
                    <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Catalog: core labels</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Labels used on the catalog page.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit catalog labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-archive-${lang}`} className="text-xs">
                                Archive Inventory ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.archiveInventory?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    archiveInventory: { ...(base.ui?.catalog?.archiveInventory ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-titleall-${lang}`} className="text-xs">
                                Catalog Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.titleAll?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    titleAll: { ...(base.ui?.catalog?.titleAll ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-category-${lang}`} className="text-xs">
                                Category Label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.categoryLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    categoryLabel: { ...(base.ui?.catalog?.categoryLabel ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-sortby-${lang}`} className="text-xs">
                                Sort By ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.sortBy?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    sortBy: { ...(base.ui?.catalog?.sortBy ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-viewgrid-${lang}`} className="text-xs">
                                View Grid ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.viewGrid?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    viewGrid: { ...(base.ui?.catalog?.viewGrid ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-viewlist-${lang}`} className="text-xs">
                                View List ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.viewList?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    viewList: { ...(base.ui?.catalog?.viewList ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-showing-${lang}`} className="text-xs">
                                Showing Results ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.showingResults?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    showingResults: { ...(base.ui?.catalog?.showingResults ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                    placeholder="Showing {count} results"
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-open-${lang}`} className="text-xs">
                                Open System ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.openSystem?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    openSystem: { ...(base.ui?.catalog?.openSystem ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Catalog: sort options</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Names shown in the sort dropdown.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit sort options.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-sort-default-${lang}`} className="text-xs">
                                Default ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.sortOptions?.default?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    sortOptions: {
                                                        ...(base.ui?.catalog?.sortOptions ?? {}),
                                                        default: { ...(base.ui?.catalog?.sortOptions?.default ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-sort-newest-${lang}`} className="text-xs">
                                Newest ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.sortOptions?.newest?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    sortOptions: {
                                                        ...(base.ui?.catalog?.sortOptions ?? {}),
                                                        newest: { ...(base.ui?.catalog?.sortOptions?.newest ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-sort-price-asc-${lang}`} className="text-xs">
                                Price Asc ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.sortOptions?.priceAsc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    sortOptions: {
                                                        ...(base.ui?.catalog?.sortOptions ?? {}),
                                                        priceAsc: { ...(base.ui?.catalog?.sortOptions?.priceAsc ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-sort-price-desc-${lang}`} className="text-xs">
                                Price Desc ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.sortOptions?.priceDesc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    sortOptions: {
                                                        ...(base.ui?.catalog?.sortOptions ?? {}),
                                                        priceDesc: { ...(base.ui?.catalog?.sortOptions?.priceDesc ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-sort-alpha-${lang}`} className="text-xs">
                                Alpha Asc ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.sortOptions?.alphaAsc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    sortOptions: {
                                                        ...(base.ui?.catalog?.sortOptions ?? {}),
                                                        alphaAsc: { ...(base.ui?.catalog?.sortOptions?.alphaAsc ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Catalog: filters</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Labels shown in the filter panel.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit filters.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-title-${lang}`} className="text-xs">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.title?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        title: { ...(base.ui?.catalog?.filters?.title ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-price-${lang}`} className="text-xs">
                                Price Range ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.priceRange?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        priceRange: { ...(base.ui?.catalog?.filters?.priceRange ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-apply-${lang}`} className="text-xs">
                                Apply ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.apply?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        apply: { ...(base.ui?.catalog?.filters?.apply ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                    placeholder="View results ({count})"
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-availability-${lang}`} className="text-xs">
                                Availability ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.availability?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        availability: { ...(base.ui?.catalog?.filters?.availability ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-instock-${lang}`} className="text-xs">
                                In Stock ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.inStock?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        inStock: { ...(base.ui?.catalog?.filters?.inStock ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-format-${lang}`} className="text-xs">
                                Format ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.format?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        format: { ...(base.ui?.catalog?.filters?.format ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-authors-${lang}`} className="text-xs">
                                Authors ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.authors?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        authors: { ...(base.ui?.catalog?.filters?.authors ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-catalog-filter-noresults-${lang}`} className="text-xs">
                                No Results ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.catalog?.filters?.noResults?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                catalog: {
                                                    ...(base.ui?.catalog ?? {}),
                                                    filters: {
                                                        ...(base.ui?.catalog?.filters ?? {}),
                                                        noResults: { ...(base.ui?.catalog?.filters?.noResults ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>
                    </div>
                </details>
            ) : null}

            {isBerlinTenant ? (
                <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(60)}>
                    <summary className="cursor-pointer text-sm font-semibold">Product UI</summary>
                    <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Product: core labels</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Buttons and badges on product cards and pages.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit product labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-add-${lang}`} className="text-xs">
                                Add to Cart ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.addToCart?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    addToCart: { ...(base.ui?.product?.addToCart ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-preorder-${lang}`} className="text-xs">
                                Make Preorder ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.makePreorder?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    makePreorder: { ...(base.ui?.product?.makePreorder ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-preorder-badge-${lang}`} className="text-xs">
                                Preorder Badge ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.preorder?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    preorder: { ...(base.ui?.product?.preorder ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-new-${lang}`} className="text-xs">
                                New Badge ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.new?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    new: { ...(base.ui?.product?.new ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-bestseller-${lang}`} className="text-xs">
                                Bestseller Badge ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.bestseller?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    bestseller: { ...(base.ui?.product?.bestseller ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-oos-${lang}`} className="text-xs">
                                Out of Stock ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.outOfStock?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    outOfStock: { ...(base.ui?.product?.outOfStock ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-by-${lang}`} className="text-xs">
                                By Author ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.byAuthor?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    byAuthor: { ...(base.ui?.product?.byAuthor ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-instock-${lang}`} className="text-xs">
                                In Stock ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.inStock?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    inStock: { ...(base.ui?.product?.inStock ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-youmaylike-${lang}`} className="text-xs">
                                You May Like ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.youMayLike?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    youMayLike: { ...(base.ui?.product?.youMayLike ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-back-${lang}`} className="text-xs">
                                Back to Catalog ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.backToCatalog?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    backToCatalog: { ...(base.ui?.product?.backToCatalog ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Product: details</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Labels for the product details list.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit detail labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-detail-year-${lang}`} className="text-xs">
                                Year ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.details?.year?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    details: {
                                                        ...(base.ui?.product?.details ?? {}),
                                                        year: { ...(base.ui?.product?.details?.year ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-detail-pages-${lang}`} className="text-xs">
                                Pages ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.details?.pages?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    details: {
                                                        ...(base.ui?.product?.details ?? {}),
                                                        pages: { ...(base.ui?.product?.details?.pages ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Product: formats</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("ui")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Format names shown to visitors.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit format labels.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-format-hardcover-${lang}`} className="text-xs">
                                Hardcover ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.format?.hardcover?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    format: {
                                                        ...(base.ui?.product?.format ?? {}),
                                                        hardcover: { ...(base.ui?.product?.format?.hardcover ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-format-paperback-${lang}`} className="text-xs">
                                Paperback ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.format?.paperback?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    format: {
                                                        ...(base.ui?.product?.format ?? {}),
                                                        paperback: { ...(base.ui?.product?.format?.paperback ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-format-digital-${lang}`} className="text-xs">
                                Digital ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.format?.digital?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    format: {
                                                        ...(base.ui?.product?.format ?? {}),
                                                        digital: { ...(base.ui?.product?.format?.digital ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`ui-product-format-special-${lang}`} className="text-xs">
                                Special Edition ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.ui?.product?.format?.specialEdition?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            ui: {
                                                ...(base.ui ?? {}),
                                                product: {
                                                    ...(base.ui?.product ?? {}),
                                                    format: {
                                                        ...(base.ui?.product?.format ?? {}),
                                                        specialEdition: { ...(base.ui?.product?.format?.specialEdition ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>
            ) : null}

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(70)}>
                <summary className="cursor-pointer text-sm font-semibold">About</summary>
                <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">About: header + body</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("about")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Main text for the About page. Keep it short and clear.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit about section.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-eyebrow-${lang}`} className="text-xs">
                                Eyebrow ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.eyebrow?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                eyebrow: { ...(base.about?.eyebrow ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-title-${lang}`} className="text-xs md:col-span-3">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.title?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                title: { ...(base.about?.title ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-text-${lang}`} className="text-xs md:col-span-3">
                                Text ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.text?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                text: { ...(base.about?.text ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-mission-${lang}`} className="text-xs md:col-span-3">
                                Mission Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.missionTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                missionTitle: { ...(base.about?.missionTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-p1-${lang}`} className="text-xs md:col-span-3">
                                Mission P1 ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.p1?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                p1: { ...(base.about?.p1 ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-p2-${lang}`} className="text-xs md:col-span-3">
                                Mission P2 ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.p2?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                p2: { ...(base.about?.p2 ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-team-${lang}`} className="text-xs">
                                Team Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.teamTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                teamTitle: { ...(base.about?.teamTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-hq-${lang}`} className="text-xs">
                                HQ Label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.hqLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                hqLabel: { ...(base.about?.hqLabel ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <ImageUrlField
                            className="text-xs md:col-span-3"
                            label="Hero Image URL"
                            value={parsedDraft.about?.heroImageUrl}
                            onChange={(next) => {
                                const base = parsedDraft ?? { version: 1 };
                                setDraft({
                                    ...base,
                                    about: {
                                        ...(base.about ?? {}),
                                        heroImageUrl: next,
                                    },
                                });
                            }}
	                            tenantSlug={tenantSlug}
	                            disabled={!canEditContent || !parsedDraft}
	                            inputClass={inputClass}
	                            placeholder="https://... or /uploads/... or /media/..."
	                            helperText="Upload from your computer (stored in R2 when configured). Result URL will be under /media/…"
	                        />
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`about-hero-alt-${lang}`} className="text-xs">
                                Hero Image Alt ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.about?.heroImageAlt?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            about: {
                                                ...(base.about ?? {}),
                                                heroImageAlt: { ...(base.about?.heroImageAlt ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">About: facts</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("about")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <a
                        href={previewHref("/about")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                    >
                        Open page
                    </a>
                    <button
                        type="button"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `fact-${Date.now()}`;
                            const next = [...(parsedDraft.about?.facts ?? []), { id, value: "", label: {} }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                about: {
                                    ...(base.about ?? {}),
                                    facts: next,
                                },
                            });
                        }}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add fact
                    </button>
                </div>
                {sectionHint("Short stats like '20+' plus a label.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit facts.</div>
                )}
                {parsedDraft && (parsedDraft.about?.facts?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No facts yet.</div>
                )}
                {parsedDraft && (parsedDraft.about?.facts?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.about?.facts?.map((fact, index) => (
                            <div key={fact.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {fact.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.about?.facts ?? [];
                                                const idx = current.findIndex((x) => x.id === fact.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), facts: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.about?.facts ?? [];
                                                const idx = current.findIndex((x) => x.id === fact.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), facts: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.about?.facts ?? []).filter((x) => x.id !== fact.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), facts: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="text-xs">
                                        Value
                                        <input
                                            value={fact.value ?? ""}
                                            onChange={(e) => {
                                                const next = (parsedDraft.about?.facts ?? []).map((x) => x.id === fact.id ? { ...x, value: e.target.value } : x);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), facts: next } });
                                            }}
                                            className={inputClass}
                                            placeholder="20+"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${fact.id}-label-${lang}`} className="text-xs">
                                            Label ({lang.toUpperCase()})
                                            <input
                                                value={fact.label?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.about?.facts ?? []).map((x) =>
                                                        x.id === fact.id
                                                            ? { ...x, label: { ...(x.label ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, about: { ...(base.about ?? {}), facts: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">About: team members</h3>
                    <button
                        type="button"
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `member-${Date.now()}`;
                            const next = [...(parsedDraft.about?.teamMembers ?? []), { id, name: {}, role: {}, imageUrl: "https://" }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                about: {
                                    ...(base.about ?? {}),
                                    teamMembers: next,
                                },
                            });
                        }}
                        disabled={!parsedDraft}
                    >
                        + Add member
                    </button>
                </div>
                {sectionHint("Team members with name, role, and photo.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit team members.</div>
                )}
                {parsedDraft && (parsedDraft.about?.teamMembers?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No team members yet.</div>
                )}
                {parsedDraft && (parsedDraft.about?.teamMembers?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.about?.teamMembers?.map((member, index) => (
                            <div key={member.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {member.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.about?.teamMembers ?? [];
                                                const idx = current.findIndex((x) => x.id === member.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), teamMembers: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.about?.teamMembers ?? [];
                                                const idx = current.findIndex((x) => x.id === member.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), teamMembers: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.about?.teamMembers ?? []).filter((x) => x.id !== member.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, about: { ...(base.about ?? {}), teamMembers: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
	                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
	                                    <ImageUrlField
	                                        className="text-xs md:col-span-2"
	                                        label="Image URL"
	                                        value={member.imageUrl}
	                                        onChange={(next) => {
	                                            const value = next ?? "";
	                                            const members = parsedDraft.about?.teamMembers ?? [];
	                                            const updated = members.map((x) => x.id === member.id ? { ...x, imageUrl: value } : x);
	                                            const base = parsedDraft ?? { version: 1 };
	                                            setDraft({ ...base, about: { ...(base.about ?? {}), teamMembers: updated } });
		                                        }}
		                                        tenantSlug={tenantSlug}
		                                        disabled={!canEditContent || !parsedDraft}
		                                        required
		                                        inputClass={inputClass}
		                                        placeholder="/media/... or https://..."
		                                        helperText="Image is required. Use Remove to delete the team member."
		                                    />
		                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${member.id}-name-${lang}`} className="text-xs">
                                            Name ({lang.toUpperCase()})
                                            <input
                                                value={member.name?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.about?.teamMembers ?? []).map((x) =>
                                                        x.id === member.id
                                                            ? { ...x, name: { ...(x.name ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, about: { ...(base.about ?? {}), teamMembers: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${member.id}-role-${lang}`} className="text-xs">
                                            Role ({lang.toUpperCase()})
                                            <input
                                                value={member.role?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.about?.teamMembers ?? []).map((x) =>
                                                        x.id === member.id
                                                            ? { ...x, role: { ...(x.role ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, about: { ...(base.about ?? {}), teamMembers: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(40)}>
                <summary className="cursor-pointer text-sm font-semibold">Home</summary>
                <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Main: hero</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <a
                        href={previewHref("/main")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                    >
                        Open page
                    </a>
                </div>
                {sectionHint("Main hero headline and button on the homepage.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit hero.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`hero-eyebrow-${lang}`} className="text-xs">
                                Eyebrow ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.hero?.eyebrow?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                hero: {
                                                    ...(base.homepage?.hero ?? {}),
                                                    eyebrow: { ...(base.homepage?.hero?.eyebrow ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`hero-title-${lang}`} className="text-xs md:col-span-3">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.hero?.title?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                hero: {
                                                    ...(base.homepage?.hero ?? {}),
                                                    title: { ...(base.homepage?.hero?.title ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`hero-sub-${lang}`} className="text-xs md:col-span-3">
                                Subtitle ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.hero?.subtitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                hero: {
                                                    ...(base.homepage?.hero ?? {}),
                                                    subtitle: { ...(base.homepage?.hero?.subtitle ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`hero-cta-${lang}`} className="text-xs">
                                CTA Text ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.hero?.ctaText?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                hero: {
                                                    ...(base.homepage?.hero ?? {}),
                                                    ctaText: { ...(base.homepage?.hero?.ctaText ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <label className="text-xs">
                            CTA Href (/...)
                            <input
                                value={parsedDraft.homepage?.hero?.ctaHref ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        homepage: {
                                            ...(base.homepage ?? {}),
                                            hero: {
                                                ...(base.homepage?.hero ?? {}),
                                                ctaHref: e.target.value || undefined,
                                            },
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="/catalog"
                            />
                        </label>
                        <ImageUrlField
                            className="text-xs md:col-span-3"
                            label="Hero Image URL"
                            value={parsedDraft.homepage?.hero?.imageUrl}
                            onChange={(next) => {
                                const base = parsedDraft ?? { version: 1 };
                                setDraft({
                                    ...base,
                                    homepage: {
                                        ...(base.homepage ?? {}),
                                        hero: {
                                            ...(base.homepage?.hero ?? {}),
                                            imageUrl: next,
                                        },
                                    },
                                });
                            }}
	                            tenantSlug={tenantSlug}
	                            disabled={!canEditContent || !parsedDraft}
	                            inputClass={inputClass}
	                            placeholder="https://... or /uploads/... or /media/..."
	                            helperText="Upload from your computer (stored in R2 when configured). Result URL will be under /media/…"
	                        />
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`hero-image-alt-${lang}`} className="text-xs">
                                Hero Image Alt ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.hero?.imageAlt?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                hero: {
                                                    ...(base.homepage?.hero ?? {}),
                                                    imageAlt: { ...(base.homepage?.hero?.imageAlt ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Main: featured</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Featured block with a title and link to another page.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit featured.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`featured-label-${lang}`} className="text-xs">
                                Label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.featured?.label?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                featured: {
                                                    ...(base.homepage?.featured ?? {}),
                                                    label: { ...(base.homepage?.featured?.label ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`featured-title-${lang}`} className="text-xs md:col-span-3">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.featured?.title?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                featured: {
                                                    ...(base.homepage?.featured ?? {}),
                                                    title: { ...(base.homepage?.featured?.title ?? {}), [lang]: e.target.value || undefined },
                                                },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}

                        <label className="text-xs md:col-span-3">
                            Href (/...)
                            <input
                                value={parsedDraft.homepage?.featured?.href ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        homepage: {
                                            ...(base.homepage ?? {}),
                                            featured: {
                                                ...(base.homepage?.featured ?? {}),
                                                href: e.target.value || undefined,
                                            },
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="/journal"
                            />
                        </label>
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Main: new arrivals title</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Section heading above new arrivals.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit new arrivals title.</div>
                )}
	                {parsedDraft && (
	                    <div className="bg-paper border border-line rounded-md p-3">
	                        <label className="text-xs flex items-center gap-2">
	                            <input
	                                type="checkbox"
	                                checked={parsedDraft.homepage?.newArrivalsHeadingEnabled !== false}
	                                onChange={(e) => {
	                                    const base = parsedDraft ?? { version: 1 };
	                                    setDraft({
	                                        ...base,
	                                        homepage: {
	                                            ...(base.homepage ?? {}),
	                                            newArrivalsHeadingEnabled: e.target.checked,
	                                        },
	                                    });
	                                }}
	                            />
	                            Show “New Arrivals” heading
	                        </label>
	                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
	                        {(["de", "en"] as const).map((lang) => (
	                            <label key={`new-arrivals-${lang}`} className="text-xs">
	                                Title ({lang.toUpperCase()})
	                                <input
                                    value={parsedDraft.homepage?.newArrivalsTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                newArrivalsTitle: { ...(base.homepage?.newArrivalsTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
	                                />
	                            </label>
	                        ))}
	                        </div>
	                    </div>
	                )}
	            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Main: view all link</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Link label and internal /path to view all items.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit view all link.</div>
                )}
                {parsedDraft && (
                    <div className="bg-paper border border-line rounded-md p-3">
                        <label className="text-xs flex items-center gap-2">
                            <input
                                type="checkbox"
                                checked={parsedDraft.homepage?.viewAllLinkEnabled !== false}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        homepage: {
                                            ...(base.homepage ?? {}),
                                            viewAllLinkEnabled: e.target.checked,
                                        },
                                    });
                                }}
                            />
                            Show “View all” link
                        </label>
                        <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`view-all-label-${lang}`} className="text-xs">
                                Label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.viewAllLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                viewAllLabel: { ...(base.homepage?.viewAllLabel ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <label className="text-xs md:col-span-3">
                            Href (/...)
                            <input
                                value={parsedDraft.homepage?.viewAllHref ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        homepage: {
                                            ...(base.homepage ?? {}),
                                            viewAllHref: e.target.value || undefined,
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="/catalog"
                            />
                        </label>
                        </div>
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Main: marquee vertical</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Short phrase that repeats vertically.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit marquee text.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`marquee-vertical-${lang}`} className="text-xs">
                                Text ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.marqueeVertical?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                marqueeVertical: { ...(base.homepage?.marqueeVertical ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Main: ticker items</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}`;
                            const next = [...(parsedDraft.homepage?.ticker ?? []), { id, text: {} }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                homepage: {
                                    ...(base.homepage ?? {}),
                                    ticker: next,
                                },
                            });
                        }}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add item
                    </button>
                </div>
                {sectionHint("Short phrases that scroll in the ticker.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit ticker.</div>
                )}
                {parsedDraft && (parsedDraft.homepage?.ticker?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No ticker items yet.</div>
                )}
                {parsedDraft && (parsedDraft.homepage?.ticker?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.homepage?.ticker?.map((item, index) => (
                            <div key={item.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {item.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.homepage?.ticker ?? [];
                                                const idx = current.findIndex((x) => x.id === item.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), ticker: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.homepage?.ticker ?? [];
                                                const idx = current.findIndex((x) => x.id === item.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), ticker: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.homepage?.ticker ?? []).filter((x) => x.id !== item.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), ticker: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-text-${lang}`} className="text-xs">
                                            Text ({lang.toUpperCase()})
                                            <input
                                                value={item.text?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.homepage?.ticker ?? []).map((x) =>
                                                        x.id === item.id
                                                            ? { ...x, text: { ...(x.text ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, homepage: { ...(base.homepage ?? {}), ticker: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Main: editorial</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Editorial block with image, title, and short description.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit editorial section.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`editorial-title-${lang}`} className="text-xs">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.editorialTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                editorialTitle: { ...(base.homepage?.editorialTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`editorial-desc-${lang}`} className="text-xs md:col-span-3">
                                Description ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.editorialDesc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                editorialDesc: { ...(base.homepage?.editorialDesc ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <ImageUrlField
                            className="text-xs md:col-span-3"
                            label="Image URL"
                            value={parsedDraft.homepage?.editorialImageUrl}
                            onChange={(next) => {
                                const base = parsedDraft ?? { version: 1 };
                                setDraft({
                                    ...base,
                                    homepage: {
                                        ...(base.homepage ?? {}),
                                        editorialImageUrl: next,
                                    },
                                });
                            }}
	                            tenantSlug={tenantSlug}
	                            disabled={!canEditContent || !parsedDraft}
	                            inputClass={inputClass}
	                            placeholder="https://... or /uploads/... or /media/..."
	                            helperText="Upload from your computer (stored in R2 when configured). Result URL will be under /media/…"
	                        />
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`editorial-image-alt-${lang}`} className="text-xs">
                                Image Alt ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.homepage?.editorialImageAlt?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            homepage: {
                                                ...(base.homepage ?? {}),
                                                editorialImageAlt: { ...(base.homepage?.editorialImageAlt ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Main: stats</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("homepage")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <button
                        type="button"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `stat-${Date.now()}`;
                            const next = [...(parsedDraft.homepage?.stats ?? []), { id, value: "", label: {} }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                homepage: {
                                    ...(base.homepage ?? {}),
                                    stats: next,
                                },
                            });
                        }}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add stat
                    </button>
                </div>
                {sectionHint("Homepage stats; value + label.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit stats.</div>
                )}
                {parsedDraft && (parsedDraft.homepage?.stats?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No stats yet.</div>
                )}
                {parsedDraft && (parsedDraft.homepage?.stats?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.homepage?.stats?.map((stat, index) => (
                            <div key={stat.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {stat.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.homepage?.stats ?? [];
                                                const idx = current.findIndex((x) => x.id === stat.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), stats: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.homepage?.stats ?? [];
                                                const idx = current.findIndex((x) => x.id === stat.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), stats: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.homepage?.stats ?? []).filter((x) => x.id !== stat.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), stats: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <label className="text-xs">
                                        Value
                                        <input
                                            value={stat.value ?? ""}
                                            onChange={(e) => {
                                                const next = (parsedDraft.homepage?.stats ?? []).map((x) => x.id === stat.id ? { ...x, value: e.target.value } : x);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, homepage: { ...(base.homepage ?? {}), stats: next } });
                                            }}
                                            className={inputClass}
                                            placeholder="12"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${stat.id}-label-${lang}`} className="text-xs">
                                            Label ({lang.toUpperCase()})
                                            <input
                                                value={stat.label?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.homepage?.stats ?? []).map((x) =>
                                                        x.id === stat.id
                                                            ? { ...x, label: { ...(x.label ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, homepage: { ...(base.homepage ?? {}), stats: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(72)}>
                <summary className="cursor-pointer text-sm font-semibold">Media</summary>
                <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Media: header</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("media")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <a
                        href={previewHref("/media")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                    >
                        Open page
                    </a>
                </div>
                {sectionHint("Media/press page header and press kit labels.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit media header.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        <label className="text-xs">
                            Title (DE)
                            <input
                                value={parsedDraft.media?.title?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            title: { ...(base.media?.title ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Title (EN)
                            <input
                                value={parsedDraft.media?.title?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            title: { ...(base.media?.title ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Title (RU)
                            <input
                                value={parsedDraft.media?.title?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            title: { ...(base.media?.title ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        <label className="text-xs md:col-span-3">
                            Subtitle (DE)
                            <input
                                value={parsedDraft.media?.subtitle?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            subtitle: { ...(base.media?.subtitle ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs md:col-span-3">
                            Subtitle (EN)
                            <input
                                value={parsedDraft.media?.subtitle?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            subtitle: { ...(base.media?.subtitle ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs md:col-span-3">
                            Subtitle (RU)
                            <input
                                value={parsedDraft.media?.subtitle?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            subtitle: { ...(base.media?.subtitle ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-kit-title-${lang}`} className="text-xs">
                                Kit Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.kitTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                kitTitle: { ...(base.media?.kitTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-kit-desc-${lang}`} className="text-xs md:col-span-3">
                                Kit Desc ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.kitDesc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                kitDesc: { ...(base.media?.kitDesc ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-download-${lang}`} className="text-xs">
                                Download Text ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.downloadText?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                downloadText: { ...(base.media?.downloadText ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <label className="text-xs md:col-span-3">
                            Download Link Href (https://, /media/..., or mailto:)
                            <input
                                value={parsedDraft.media?.kitHref ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            kitHref: e.target.value || undefined,
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="/media/... or https://... or mailto:press@..."
                            />
                        </label>
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-review-title-${lang}`} className="text-xs">
                                Review Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.reviewTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                reviewTitle: { ...(base.media?.reviewTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-review-desc-${lang}`} className="text-xs md:col-span-3">
                                Review Desc ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.reviewDesc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                reviewDesc: { ...(base.media?.reviewDesc ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-contact-${lang}`} className="text-xs">
                                Contact PR ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.contactPrText?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                contactPrText: { ...(base.media?.contactPrText ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <label className="text-xs md:col-span-3">
                            Contact PR Link Href (https:// or mailto:)
                            <input
                                value={parsedDraft.media?.contactPrHref ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            contactPrHref: e.target.value || undefined,
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="mailto:pr@... or https://..."
                            />
                        </label>
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-mentions-${lang}`} className="text-xs">
                                Mentions Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.mentionsTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                mentionsTitle: { ...(base.media?.mentionsTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Media: interview card</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("media")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                </div>
                {sectionHint("Promo card for an interview or feature.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit interview card.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-interview-title-${lang}`} className="text-xs">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.interviewTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                interviewTitle: { ...(base.media?.interviewTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-interview-desc-${lang}`} className="text-xs md:col-span-3">
                                Description ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.interviewDesc?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                interviewDesc: { ...(base.media?.interviewDesc ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`media-interview-cta-${lang}`} className="text-xs">
                                CTA ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.media?.interviewCta?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            media: {
                                                ...(base.media ?? {}),
                                                interviewCta: { ...(base.media?.interviewCta ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <label className="text-xs md:col-span-3">
                            CTA Link Href (https://, /..., or mailto:)
                            <input
                                value={parsedDraft.media?.interviewHref ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            interviewHref: e.target.value || undefined,
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="mailto:... or /... or https://..."
                            />
                        </label>
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Media: mentions</h3>
                    <div className="flex items-center gap-2">
                        <label className="text-xs flex items-center gap-2 select-none">
                            <input
                                type="checkbox"
                                checked={parsedDraft?.media?.mentionsEnabled !== false}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        media: {
                                            ...(base.media ?? {}),
                                            mentionsEnabled: e.target.checked ? undefined : false,
                                        },
                                    });
                                }}
                                disabled={!parsedDraft}
                            />
                            Show on site
                        </label>
                        <button
                            type="button"
                            onClick={addMediaMention}
                            className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                            disabled={!parsedDraft}
                        >
                            + Add mention
                        </button>
                    </div>
                </div>
                {sectionHint("Press mentions list. Choose an icon and add the article link.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit mentions.</div>
                )}
                {parsedDraft && mediaMentions.length === 0 && (
                    <div className="text-xs text-muted mt-2">No mentions yet.</div>
                )}
                {parsedDraft && mediaMentions.length > 0 && (
                    <div className="mt-3 space-y-3">
                        {mediaMentions.map((item, index) => (
                            <div key={item.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {item.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => moveMediaMention(item.id, -1)}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => moveMediaMention(item.id, 1)}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => removeMediaMention(item.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <label className="text-xs">
                                        Icon
                                        <select
                                            value={item.icon ?? "globe"}
                                            onChange={(e) => updateMediaMention(item.id, { icon: e.target.value as "globe" | "user" | "badge" })}
                                            className={inputClass}
                                        >
                                            <option value="globe">globe</option>
                                            <option value="user">user</option>
                                            <option value="badge">badge</option>
                                        </select>
                                    </label>
                                    <label className="text-xs md:col-span-2">
                                        Href (https:// or /...)
                                        <input
                                            value={item.href ?? ""}
                                            onChange={(e) => updateMediaMention(item.id, { href: e.target.value || undefined })}
                                            className={inputClass}
                                            placeholder="https://..."
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-outlet-${lang}`} className="text-xs">
                                            Outlet ({lang.toUpperCase()})
                                            <input
                                                value={typeof item.outlet === "string" ? item.outlet : item.outlet?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const outlet = typeof item.outlet === "string" ? {} : (item.outlet ?? {});
                                                    updateMediaMention(item.id, { outlet: { ...outlet, [lang]: e.target.value || undefined } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-title-${lang}`} className="text-xs md:col-span-3">
                                            Title ({lang.toUpperCase()})
                                            <input
                                                value={typeof item.title === "string" ? item.title : item.title?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const title = typeof item.title === "string" ? {} : (item.title ?? {});
                                                    updateMediaMention(item.id, { title: { ...title, [lang]: e.target.value || undefined } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-date-${lang}`} className="text-xs">
                                            Date ({lang.toUpperCase()})
                                            <input
                                                value={typeof item.date === "string" ? item.date : item.date?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const date = typeof item.date === "string" ? {} : (item.date ?? {});
                                                    updateMediaMention(item.id, { date: { ...date, [lang]: e.target.value || undefined } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(73)}>
                <summary className="cursor-pointer text-sm font-semibold">Journal</summary>
                <div className="mt-4 space-y-4">
                    <div className="rounded-md border border-line p-4 bg-paper">
                        <div className="flex items-center justify-between mb-2">
                            <h3 className="text-sm font-semibold">Journal: page copy</h3>
                            <button
                                type="button"
                                className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                onClick={() => onResetSection("journal")}
                                disabled={!parsedDraft}
                            >
                                Reset section
                            </button>
                            <a
                                href={previewHref("/journal")}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                            >
                                Open page
                            </a>
                        </div>
                        {sectionHint(
                            "These texts appear on /journal (title + subtitle + optional archive toast). Posts are edited in Admin → Journal."
                        )}
                        {!parsedDraft && (
                            <div className="text-xs text-danger">Fix JSON errors to edit journal copy.</div>
                        )}
                        {parsedDraft && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                                {(["de", "en"] as const).map((lang) => (
                                    <label key={`journal-title-${lang}`} className="text-xs md:col-span-3">
                                        Title ({lang.toUpperCase()})
                                        <input
                                            value={parsedDraft.journal?.title?.[lang] ?? ""}
                                            onChange={(e) => {
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({
                                                    ...base,
                                                    journal: {
                                                        ...(base.journal ?? {}),
                                                        title: { ...(base.journal?.title ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                });
                                            }}
                                            className={inputClass}
                                        />
                                    </label>
                                ))}

                                {(["de", "en"] as const).map((lang) => (
                                    <label key={`journal-subtitle-${lang}`} className="text-xs md:col-span-3">
                                        Subtitle ({lang.toUpperCase()})
                                        <input
                                            value={parsedDraft.journal?.subtitle?.[lang] ?? ""}
                                            onChange={(e) => {
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({
                                                    ...base,
                                                    journal: {
                                                        ...(base.journal ?? {}),
                                                        subtitle: { ...(base.journal?.subtitle ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                });
                                            }}
                                            className={inputClass}
                                        />
                                    </label>
                                ))}

                                {(["de", "en"] as const).map((lang) => (
                                    <label key={`journal-archive-toast-${lang}`} className="text-xs md:col-span-3">
                                        Archive Toast ({lang.toUpperCase()}) (optional)
                                        <input
                                            value={parsedDraft.journal?.archiveToast?.[lang] ?? ""}
                                            onChange={(e) => {
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({
                                                    ...base,
                                                    journal: {
                                                        ...(base.journal ?? {}),
                                                        archiveToast: { ...(base.journal?.archiveToast ?? {}), [lang]: e.target.value || undefined },
                                                    },
                                                });
                                            }}
                                            className={inputClass}
                                        />
                                    </label>
                                ))}
                            </div>
                        )}
                    </div>
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Journal: homepage list (legacy)</h3>
                    <button
                        type="button"
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `item-${Date.now()}`;
                            const next = [...(parsedDraft.journal?.items ?? []), { id, date: {}, title: {}, preview: {} }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                journal: {
                                    ...(base.journal ?? {}),
                                    items: next,
                                },
                            });
                        }}
                        disabled={!parsedDraft}
                    >
                        + Add item
                    </button>
                </div>
                {sectionHint(
                    "Legacy journal rows. If you use Journal posts (Admin → Journal), homepage picks are controlled there; this list can be left empty."
                )}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit journal items.</div>
                )}
                {parsedDraft && (parsedDraft.journal?.items?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No journal items yet.</div>
                )}
                {parsedDraft && (parsedDraft.journal?.items?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.journal?.items?.map((item, index) => (
                            <div key={item.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {item.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.journal?.items ?? [];
                                                const idx = current.findIndex((x) => x.id === item.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, journal: { ...(base.journal ?? {}), items: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.journal?.items ?? [];
                                                const idx = current.findIndex((x) => x.id === item.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, journal: { ...(base.journal ?? {}), items: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.journal?.items ?? []).filter((x) => x.id !== item.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, journal: { ...(base.journal ?? {}), items: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-date-${lang}`} className="text-xs">
                                            Date ({lang.toUpperCase()})
                                            <input
                                                value={item.date?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.journal?.items ?? []).map((x) =>
                                                        x.id === item.id
                                                            ? { ...x, date: { ...(x.date ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, journal: { ...(base.journal ?? {}), items: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-title-${lang}`} className="text-xs md:col-span-3">
                                            Title ({lang.toUpperCase()})
                                            <input
                                                value={item.title?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.journal?.items ?? []).map((x) =>
                                                        x.id === item.id
                                                            ? { ...x, title: { ...(x.title ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, journal: { ...(base.journal ?? {}), items: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${item.id}-preview-${lang}`} className="text-xs md:col-span-3">
                                            Preview ({lang.toUpperCase()})
                                            <input
                                                value={item.preview?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.journal?.items ?? []).map((x) =>
                                                        x.id === item.id
                                                            ? { ...x, preview: { ...(x.preview ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, journal: { ...(base.journal ?? {}), items: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Authors: header + CTA</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("authors")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <a
                        href={previewHref("/authors")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                    >
                        Open page
                    </a>
                </div>
                {sectionHint("Authors page intro and submission call-to-action.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit authors header.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-title-${lang}`} className="text-xs">
                                Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.title?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                title: { ...(base.authors?.title ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-sub-${lang}`} className="text-xs md:col-span-3">
                                Subtitle ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.subtitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                subtitle: { ...(base.authors?.subtitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-manifesto-${lang}`} className="text-xs">
                                Manifesto Label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.manifestoLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                manifestoLabel: { ...(base.authors?.manifestoLabel ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-what-${lang}`} className="text-xs md:col-span-3">
                                What We Publish ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.whatWePublishTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                whatWePublishTitle: { ...(base.authors?.whatWePublishTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-p1-${lang}`} className="text-xs md:col-span-3">
                                Paragraph 1 ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.p1?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                p1: { ...(base.authors?.p1 ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-p2-${lang}`} className="text-xs md:col-span-3">
                                Paragraph 2 ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.p2?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                p2: { ...(base.authors?.p2 ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-prose-${lang}`} className="text-xs">
                                Prose Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.proseTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                proseTitle: { ...(base.authors?.proseTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-prose-sub-${lang}`} className="text-xs">
                                Prose Sub ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.proseSub?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                proseSub: { ...(base.authors?.proseSub ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-poetry-${lang}`} className="text-xs">
                                Poetry Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.poetryTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                poetryTitle: { ...(base.authors?.poetryTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-poetry-sub-${lang}`} className="text-xs">
                                Poetry Sub ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.poetrySub?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                poetrySub: { ...(base.authors?.poetrySub ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-essays-${lang}`} className="text-xs">
                                Essays Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.essaysTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                essaysTitle: { ...(base.authors?.essaysTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-essays-sub-${lang}`} className="text-xs">
                                Essays Sub ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.essaysSub?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                essaysSub: { ...(base.authors?.essaysSub ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-process-${lang}`} className="text-xs md:col-span-3">
                                Process Title ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.processTitle?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                processTitle: { ...(base.authors?.processTitle ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-cta-${lang}`} className="text-xs md:col-span-3">
                                CTA Text ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.ctaText?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                ctaText: { ...(base.authors?.ctaText ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-cta-sub-${lang}`} className="text-xs md:col-span-3">
                                CTA Sub ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.ctaSub?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                ctaSub: { ...(base.authors?.ctaSub ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-cta-btn-${lang}`} className="text-xs md:col-span-3">
                                CTA Button ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.ctaButtonText?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                ctaButtonText: { ...(base.authors?.ctaButtonText ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`authors-cta-note-${lang}`} className="text-xs md:col-span-3">
                                CTA Note ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.authors?.ctaNote?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            authors: {
                                                ...(base.authors ?? {}),
                                                ctaNote: { ...(base.authors?.ctaNote ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        <label className="text-xs md:col-span-3">
                            CTA Href (https://)
                            <input
                                value={parsedDraft.authors?.ctaHref ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        authors: {
                                            ...(base.authors ?? {}),
                                            ctaHref: e.target.value || undefined,
                                        },
                                    });
                                }}
                                className={inputClass}
                                placeholder="https://..."
                            />
                        </label>
                    </div>
                )}
            </div>
                </div>
            </details>

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(71)}>
                <summary className="cursor-pointer text-sm font-semibold">Authors</summary>
                <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Authors: steps</h3>
                    <button
                        type="button"
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `step-${Date.now()}`;
                            const next = [...(parsedDraft.authors?.steps ?? []), { id, title: {}, desc: {} }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                authors: {
                                    ...(base.authors ?? {}),
                                    steps: next,
                                },
                            });
                        }}
                        disabled={!parsedDraft}
                    >
                        + Add step
                    </button>
                </div>
                {sectionHint("Steps of the submission process. Keep each step short.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit steps.</div>
                )}
                {parsedDraft && (parsedDraft.authors?.steps?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No steps yet.</div>
                )}
                {parsedDraft && (parsedDraft.authors?.steps?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.authors?.steps?.map((step, index) => (
                            <div key={step.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {step.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.authors?.steps ?? [];
                                                const idx = current.findIndex((x) => x.id === step.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, authors: { ...(base.authors ?? {}), steps: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.authors?.steps ?? [];
                                                const idx = current.findIndex((x) => x.id === step.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, authors: { ...(base.authors ?? {}), steps: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.authors?.steps ?? []).filter((x) => x.id !== step.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, authors: { ...(base.authors ?? {}), steps: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${step.id}-title-${lang}`} className="text-xs md:col-span-3">
                                            Title ({lang.toUpperCase()})
                                            <input
                                                value={step.title?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.authors?.steps ?? []).map((x) =>
                                                        x.id === step.id
                                                            ? { ...x, title: { ...(x.title ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, authors: { ...(base.authors ?? {}), steps: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${step.id}-desc-${lang}`} className="text-xs md:col-span-3">
                                            Desc ({lang.toUpperCase()})
                                            <input
                                                value={step.desc?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.authors?.steps ?? []).map((x) =>
                                                        x.id === step.id
                                                            ? { ...x, desc: { ...(x.desc ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, authors: { ...(base.authors ?? {}), steps: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold">Footer: texts</h3>
                    <button
                        type="button"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                        onClick={() => onResetSection("footer")}
                        disabled={!parsedDraft}
                    >
                        Reset section
                    </button>
                    <a
                        href={previewHref("/main")}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                    >
                        Open page
                    </a>
                </div>
                {sectionHint("Footer headings and newsletter text.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger">Fix JSON errors to edit footer texts.</div>
                )}
                {parsedDraft && (
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                        <label className="text-xs">
                            Brand Title (DE)
                            <input
                                value={parsedDraft.footer?.brandTitle?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            brandTitle: { ...(base.footer?.brandTitle ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Brand Title (EN)
                            <input
                                value={parsedDraft.footer?.brandTitle?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            brandTitle: { ...(base.footer?.brandTitle ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Brand Title (RU)
                            <input
                                value={parsedDraft.footer?.brandTitle?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            brandTitle: { ...(base.footer?.brandTitle ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        <label className="text-xs md:col-span-3">
                            Brand Text (DE)
                            <input
                                value={parsedDraft.footer?.brandText?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            brandText: { ...(base.footer?.brandText ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs md:col-span-3">
                            Brand Text (EN)
                            <input
                                value={parsedDraft.footer?.brandText?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            brandText: { ...(base.footer?.brandText ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs md:col-span-3">
                            Brand Text (RU)
                            <input
                                value={parsedDraft.footer?.brandText?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            brandText: { ...(base.footer?.brandText ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        <label className="text-xs">
                            Directory Title (DE)
                            <input
                                value={parsedDraft.footer?.directoryTitle?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            directoryTitle: { ...(base.footer?.directoryTitle ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Directory Title (EN)
                            <input
                                value={parsedDraft.footer?.directoryTitle?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            directoryTitle: { ...(base.footer?.directoryTitle ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Directory Title (RU)
                            <input
                                value={parsedDraft.footer?.directoryTitle?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            directoryTitle: { ...(base.footer?.directoryTitle ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        <label className="text-xs">
                            Subscribe Title (DE)
                            <input
                                value={parsedDraft.footer?.subscribeTitle?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            subscribeTitle: { ...(base.footer?.subscribeTitle ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Subscribe Title (EN)
                            <input
                                value={parsedDraft.footer?.subscribeTitle?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            subscribeTitle: { ...(base.footer?.subscribeTitle ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Subscribe Title (RU)
                            <input
                                value={parsedDraft.footer?.subscribeTitle?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            subscribeTitle: { ...(base.footer?.subscribeTitle ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        <label className="text-xs md:col-span-3">
                            Subscribe Span (DE)
                            <input
                                value={parsedDraft.footer?.subscribeSpan?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            subscribeSpan: { ...(base.footer?.subscribeSpan ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs md:col-span-3">
                            Subscribe Span (EN)
                            <input
                                value={parsedDraft.footer?.subscribeSpan?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            subscribeSpan: { ...(base.footer?.subscribeSpan ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs md:col-span-3">
                            Subscribe Span (RU)
                            <input
                                value={parsedDraft.footer?.subscribeSpan?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            subscribeSpan: { ...(base.footer?.subscribeSpan ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        <label className="text-xs">
                            Social Title (DE)
                            <input
                                value={parsedDraft.footer?.socialTitle?.de ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            socialTitle: { ...(base.footer?.socialTitle ?? {}), de: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Social Title (EN)
                            <input
                                value={parsedDraft.footer?.socialTitle?.en ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            socialTitle: { ...(base.footer?.socialTitle ?? {}), en: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>
                        <label className="text-xs">
                            Social Title (RU)
                            <input
                                value={parsedDraft.footer?.socialTitle?.ru ?? ""}
                                onChange={(e) => {
                                    const base = parsedDraft ?? { version: 1 };
                                    setDraft({
                                        ...base,
                                        footer: {
                                            ...(base.footer ?? {}),
                                            socialTitle: { ...(base.footer?.socialTitle ?? {}), ru: e.target.value || undefined },
                                        },
                                    });
                                }}
                                className={inputClass}
                            />
                        </label>

                        {(["de", "en"] as const).map((lang) => (
                            <label key={`footer-email-ph-${lang}`} className="text-xs md:col-span-3">
                                Email Placeholder ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.footer?.emailPlaceholder?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            footer: {
                                                ...(base.footer ?? {}),
                                                emailPlaceholder: { ...(base.footer?.emailPlaceholder ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`footer-submit-${lang}`} className="text-xs">
                                Submit Label ({lang.toUpperCase()})
                                <input
                                    value={parsedDraft.footer?.submitLabel?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        setDraft({
                                            ...base,
                                            footer: {
                                                ...(base.footer ?? {}),
                                                submitLabel: { ...(base.footer?.submitLabel ?? {}), [lang]: e.target.value || undefined },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                        {(["de", "en"] as const).map((lang) => (
                            <label key={`footer-copyright-${lang}`} className="text-xs md:col-span-3">
                                Copyright ({lang.toUpperCase()})
                                <input
                                    value={typeof parsedDraft.footer?.copyright === "string" ? parsedDraft.footer?.copyright : parsedDraft.footer?.copyright?.[lang] ?? ""}
                                    onChange={(e) => {
                                        const base = parsedDraft ?? { version: 1 };
                                        const nextValue = e.target.value || undefined;
                                        setDraft({
                                            ...base,
                                            footer: {
                                                ...(base.footer ?? {}),
                                                copyright: { ...(typeof base.footer?.copyright === "object" ? base.footer?.copyright : {}), [lang]: nextValue },
                                            },
                                        });
                                    }}
                                    className={inputClass}
                                />
                            </label>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(30)}>
                <summary className="cursor-pointer text-sm font-semibold">Footer</summary>
                <div className="mt-4 space-y-4">
            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Media: items</h3>
                    <button
                        type="button"
                        onClick={addMediaItem}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add item
                    </button>
                </div>
                {sectionHint("Partner or outlet logos with optional external links.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit media items.</div>
                )}
                {parsedDraft && mediaItems.length === 0 && (
                    <div className="text-xs text-muted mt-2">No media items yet.</div>
                )}
                {parsedDraft && mediaItems.length > 0 && (
                    <div className="mt-3 space-y-3">
                        {mediaItems.map((item, index) => (
                            <div key={item.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {item.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => moveMediaItem(item.id, -1)}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => moveMediaItem(item.id, 1)}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => removeMediaItem(item.id)}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>

	                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
		                                    <ImageUrlField
		                                        className="text-xs"
		                                        label="Logo URL"
		                                        value={item.logoUrl}
		                                        onChange={(next) => updateMediaItem(item.id, { logoUrl: next ?? "" })}
		                                        tenantSlug={tenantSlug}
		                                        disabled={!canEditContent || !parsedDraft}
		                                        required
		                                        inputClass={inputClass}
		                                        placeholder="/media/... or https://..."
		                                        helperText="Logo is required. Use Remove to delete the media item."
		                                    />
	                                    <label className="text-xs">
	                                        External URL
	                                        <input
	                                            value={item.externalHref ?? ""}
                                            onChange={(e) => updateMediaItem(item.id, { externalHref: e.target.value || undefined })}
                                            className={inputClass}
                                            placeholder="https://..."
                                        />
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    <label className="text-xs">
                                        Name (DE)
                                        <input
                                            value={item.name?.de ?? ""}
                                            onChange={(e) => updateMediaItem(item.id, { name: { ...(item.name ?? {}), de: e.target.value || undefined } })}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className="text-xs">
                                        Name (EN)
                                        <input
                                            value={item.name?.en ?? ""}
                                            onChange={(e) => updateMediaItem(item.id, { name: { ...(item.name ?? {}), en: e.target.value || undefined } })}
                                            className={inputClass}
                                        />
                                    </label>
                                    <label className="text-xs">
                                        Name (RU)
                                        <input
                                            value={item.name?.ru ?? ""}
                                            onChange={(e) => updateMediaItem(item.id, { name: { ...(item.name ?? {}), ru: e.target.value || undefined } })}
                                            className={inputClass}
                                        />
                                    </label>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Footer: directory links</h3>
                    <button
                        type="button"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `link-${Date.now()}`;
                            const next = [...(parsedDraft.footer?.directoryLinks ?? []), { id, label: {}, href: "/" }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                footer: {
                                    ...(base.footer ?? {}),
                                    directoryLinks: next,
                                },
                            });
                        }}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add link
                    </button>
                </div>
                {sectionHint("Footer navigation links. Use /path.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit directory links.</div>
                )}
                {parsedDraft && (parsedDraft.footer?.directoryLinks?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No directory links yet.</div>
                )}
                {parsedDraft && (parsedDraft.footer?.directoryLinks?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.footer?.directoryLinks?.map((link, index) => (
                            <div key={link.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {link.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.footer?.directoryLinks ?? [];
                                                const idx = current.findIndex((x) => x.id === link.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), directoryLinks: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.footer?.directoryLinks ?? [];
                                                const idx = current.findIndex((x) => x.id === link.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), directoryLinks: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.footer?.directoryLinks ?? []).filter((x) => x.id !== link.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), directoryLinks: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="text-xs">
                                        Href (/...)
                                        <input
                                            value={link.href}
                                            onChange={(e) => {
                                                const next = (parsedDraft.footer?.directoryLinks ?? []).map((x) => x.id === link.id ? { ...x, href: e.target.value } : x);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), directoryLinks: next } });
                                            }}
                                            className={inputClass}
                                            placeholder="/catalog"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${link.id}-label-${lang}`} className="text-xs">
                                            Label ({lang.toUpperCase()})
                                            <input
                                                value={link.label?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.footer?.directoryLinks ?? []).map((x) =>
                                                        x.id === link.id
                                                            ? { ...x, label: { ...(x.label ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, footer: { ...(base.footer ?? {}), directoryLinks: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Footer: social links</h3>
                    <button
                        type="button"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `link-${Date.now()}`;
                            const next = [...(parsedDraft.footer?.socialLinks ?? []), { id, label: {}, externalHref: "https://" }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                footer: {
                                    ...(base.footer ?? {}),
                                    socialLinks: next,
                                },
                            });
                        }}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add link
                    </button>
                </div>
                {sectionHint("Social profiles. Use full https:// links.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit social links.</div>
                )}
                {parsedDraft && (parsedDraft.footer?.socialLinks?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No social links yet.</div>
                )}
                {parsedDraft && (parsedDraft.footer?.socialLinks?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.footer?.socialLinks?.map((link, index) => (
                            <div key={link.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {link.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.footer?.socialLinks ?? [];
                                                const idx = current.findIndex((x) => x.id === link.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), socialLinks: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.footer?.socialLinks ?? [];
                                                const idx = current.findIndex((x) => x.id === link.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), socialLinks: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.footer?.socialLinks ?? []).filter((x) => x.id !== link.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), socialLinks: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="text-xs">
                                        External URL (https://)
                                        <input
                                            value={link.externalHref}
                                            onChange={(e) => {
                                                const next = (parsedDraft.footer?.socialLinks ?? []).map((x) => x.id === link.id ? { ...x, externalHref: e.target.value } : x);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), socialLinks: next } });
                                            }}
                                            className={inputClass}
                                            placeholder="https://..."
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${link.id}-label-${lang}`} className="text-xs">
                                            Label ({lang.toUpperCase()})
                                            <input
                                                value={link.label?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.footer?.socialLinks ?? []).map((x) =>
                                                        x.id === link.id
                                                            ? { ...x, label: { ...(x.label ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, footer: { ...(base.footer ?? {}), socialLinks: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            <div className="rounded-md border border-line p-4 bg-paper">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Footer: legal links</h3>
                    <button
                        type="button"
                        onClick={() => {
                            if (!parsedDraft) return;
                            const id = typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : `link-${Date.now()}`;
                            const next = [...(parsedDraft.footer?.legalLinks ?? []), { id, label: {}, href: "/" }];
                            const base = parsedDraft ?? { version: 1 };
                            setDraft({
                                ...base,
                                footer: {
                                    ...(base.footer ?? {}),
                                    legalLinks: next,
                                },
                            });
                        }}
                        className="rounded-md border border-line px-3 py-1 text-xs hover:bg-bg"
                        disabled={!parsedDraft}
                    >
                        + Add link
                    </button>
                </div>
                {sectionHint("Legal pages. Use /path.")}
                {!parsedDraft && (
                    <div className="text-xs text-danger mt-2">Fix JSON errors to edit legal links.</div>
                )}
                {parsedDraft && (parsedDraft.footer?.legalLinks?.length ?? 0) === 0 && (
                    <div className="text-xs text-muted mt-2">No legal links yet.</div>
                )}
                {parsedDraft && (parsedDraft.footer?.legalLinks?.length ?? 0) > 0 && (
                    <div className="mt-3 space-y-3">
                        {parsedDraft.footer?.legalLinks?.map((link, index) => (
                            <div key={link.id} className={`border border-line rounded-md ${cardPaddingClass} bg-paper`}>
                                <div className="flex items-center justify-between mb-2">
                                    <div className="text-xs text-muted">#{index + 1} · {link.id}</div>
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.footer?.legalLinks ?? [];
                                                const idx = current.findIndex((x) => x.id === link.id);
                                                if (idx <= 0) return;
                                                const next = swapByIndex(current, idx, idx - 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), legalLinks: next } });
                                            }}
                                        >
                                            ↑
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const current = parsedDraft.footer?.legalLinks ?? [];
                                                const idx = current.findIndex((x) => x.id === link.id);
                                                if (idx < 0 || idx >= current.length - 1) return;
                                                const next = swapByIndex(current, idx, idx + 1);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), legalLinks: next } });
                                            }}
                                        >
                                            ↓
                                        </button>
                                        <button
                                            type="button"
                                            className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            onClick={() => {
                                                const next = (parsedDraft.footer?.legalLinks ?? []).filter((x) => x.id !== link.id);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), legalLinks: next } });
                                            }}
                                        >
                                            Remove
                                        </button>
                                    </div>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                    <label className="text-xs">
                                        Href (/...)
                                        <input
                                            value={link.href}
                                            onChange={(e) => {
                                                const next = (parsedDraft.footer?.legalLinks ?? []).map((x) => x.id === link.id ? { ...x, href: e.target.value } : x);
                                                const base = parsedDraft ?? { version: 1 };
                                                setDraft({ ...base, footer: { ...(base.footer ?? {}), legalLinks: next } });
                                            }}
                                            className={inputClass}
                                            placeholder="/privacy"
                                        />
                                    </label>
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
                                    {(["de", "en"] as const).map((lang) => (
                                        <label key={`${link.id}-label-${lang}`} className="text-xs">
                                            Label ({lang.toUpperCase()})
                                            <input
                                                value={link.label?.[lang] ?? ""}
                                                onChange={(e) => {
                                                    const next = (parsedDraft.footer?.legalLinks ?? []).map((x) =>
                                                        x.id === link.id
                                                            ? { ...x, label: { ...(x.label ?? {}), [lang]: e.target.value || undefined } }
                                                            : x
                                                    );
                                                    const base = parsedDraft ?? { version: 1 };
                                                    setDraft({ ...base, footer: { ...(base.footer ?? {}), legalLinks: next } });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
                </div>
            </details>

            <details className="mt-6 rounded-md border border-line bg-paper p-4" open style={orderStyle(95)}>
                <summary className="cursor-pointer text-sm font-semibold">Legal pages</summary>
                <div className="mt-4 space-y-4">
                    {sectionHint("These fields show the current template by default. Changes create an override for /impressum, /terms, or /privacy (Markdown).")}
                    {!parsedDraft && (
                        <div className="text-xs text-danger">Fix JSON errors to edit legal pages.</div>
                    )}
                    {parsedDraft && (
                        <div className="space-y-4">
                            {(
                                [
                                    { key: "impressum", title: "Impressum", path: "/impressum" },
                                    { key: "terms", title: "Terms", path: "/terms" },
                                    { key: "privacy", title: "Privacy", path: "/privacy" },
                                ] as const
                            ).map((page) => (
                                <div key={page.key} className="rounded-md border border-line p-4 bg-paper">
                                    <div className="flex items-center justify-between mb-2">
                                        <h3 className="text-sm font-semibold">Legal: {page.title}</h3>
                                        <div className="flex items-center gap-2">
                                            <a
                                                href={previewHref(page.path)}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                            >
                                                Open page
                                            </a>
                                            <button
                                                type="button"
                                                className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                                onClick={() => {
                                                    const base = parsedDraft ?? { version: 1 };
                                                    const nextLegal = { ...(base.legal ?? {}) } as NonNullable<AmContentV1["legal"]>;
                                                    delete (nextLegal as Record<string, unknown>)[page.key];
                                                    setDraft({
                                                        ...base,
                                                        legal: Object.keys(nextLegal).length > 0 ? nextLegal : undefined,
                                                    });
                                                }}
                                            >
                                                Clear override
                                            </button>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-2 mb-3">
                                        {LOCALES.map((lang) => (
                                            <button
                                                key={`${page.key}-tab-${lang}`}
                                                type="button"
                                                className={[
                                                    "text-xs px-2 py-1 border rounded",
                                                    legalLang[page.key] === lang ? "border-ink bg-bg" : "border-line hover:bg-bg",
                                                ].join(" ")}
                                                onClick={() => setLegalLang((prev) => ({ ...prev, [page.key]: lang }))}
                                            >
                                                {lang.toUpperCase()}
                                            </button>
                                        ))}
                                        <div className="ml-auto flex items-center gap-2">
                                            <button
                                                type="button"
                                                className="text-xs px-2 py-1 border border-line rounded hover:bg-bg"
                                                onClick={() => {
                                                    const base = parsedDraft ?? { version: 1 };
                                                    const current = base.legal?.[page.key] ?? {};
                                                    const nextTitle = { ...(current.title ?? {}) } as Record<string, string | undefined>;
                                                    const nextSubtitle = { ...(current.subtitle ?? {}) } as Record<string, string | undefined>;
                                                    const nextBody = { ...(current.bodyMarkdown ?? {}) } as Record<string, string | undefined>;
                                                    delete nextTitle[legalLang[page.key]];
                                                    delete nextSubtitle[legalLang[page.key]];
                                                    delete nextBody[legalLang[page.key]];
                                                    setDraft({
                                                        ...base,
                                                        legal: {
                                                            ...(base.legal ?? {}),
                                                            [page.key]: {
                                                                ...(current ?? {}),
                                                                title: Object.keys(nextTitle).length > 0 ? nextTitle : undefined,
                                                                subtitle: Object.keys(nextSubtitle).length > 0 ? nextSubtitle : undefined,
                                                                bodyMarkdown: Object.keys(nextBody).length > 0 ? nextBody : undefined,
                                                            },
                                                        },
                                                    });
                                                }}
                                            >
                                                Reset to template
                                            </button>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-paper border border-line rounded-md p-3">
                                        <label className="text-xs md:col-span-3">
                                            Title ({legalLang[page.key].toUpperCase()})
                                            <input
                                                value={parsedDraft.legal?.[page.key]?.title?.[legalLang[page.key]] ?? (LEGAL_TEMPLATES[page.key][legalLang[page.key]].title as string)}
                                                onChange={(e) => {
                                                    const base = parsedDraft ?? { version: 1 };
                                                    const lang = legalLang[page.key];
                                                    setDraft({
                                                        ...base,
                                                        legal: {
                                                            ...(base.legal ?? {}),
                                                            [page.key]: {
                                                                ...(base.legal?.[page.key] ?? {}),
                                                                title: {
                                                                    ...(base.legal?.[page.key]?.title ?? {}),
                                                                    [lang]: e.target.value || undefined,
                                                                },
                                                            },
                                                        },
                                                    });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>
                                        <label className="text-xs md:col-span-3">
                                            Subtitle ({legalLang[page.key].toUpperCase()})
                                            <input
                                                value={parsedDraft.legal?.[page.key]?.subtitle?.[legalLang[page.key]] ?? (LEGAL_TEMPLATES[page.key][legalLang[page.key]].subtitle as string)}
                                                onChange={(e) => {
                                                    const base = parsedDraft ?? { version: 1 };
                                                    const lang = legalLang[page.key];
                                                    setDraft({
                                                        ...base,
                                                        legal: {
                                                            ...(base.legal ?? {}),
                                                            [page.key]: {
                                                                ...(base.legal?.[page.key] ?? {}),
                                                                subtitle: {
                                                                    ...(base.legal?.[page.key]?.subtitle ?? {}),
                                                                    [lang]: e.target.value || undefined,
                                                                },
                                                            },
                                                        },
                                                    });
                                                }}
                                                className={inputClass}
                                            />
                                        </label>

                                        <div className="md:col-span-3">
                                            <div className="flex flex-wrap items-center justify-between gap-2">
                                                <div className="text-xs text-muted">
                                                    Markdown help: headings <span className="font-mono">##</span>, list <span className="font-mono">-</span>, link{" "}
                                                    <span className="font-mono">[text](https://...)</span>
                                                </div>
                                            </div>
                                            <LegalMarkdownEditor
                                                key={`${page.key}-${legalLang[page.key]}`}
                                                tenantSlug={tenantSlug}
                                                pageKey={page.key}
                                                lang={legalLang[page.key]}
                                                value={parsedDraft.legal?.[page.key]?.bodyMarkdown?.[legalLang[page.key]] ?? legalTemplateMarkdown(page.key, legalLang[page.key])}
                                                templateValue={legalTemplateMarkdown(page.key, legalLang[page.key])}
                                                textareaClass={textareaClass}
                                                onChange={(next) => {
                                                    const base = parsedDraft ?? { version: 1 };
                                                    const lang = legalLang[page.key];
                                                    setDraft({
                                                        ...base,
                                                        legal: {
                                                            ...(base.legal ?? {}),
                                                            [page.key]: {
                                                                ...(base.legal?.[page.key] ?? {}),
                                                                bodyMarkdown: {
                                                                    ...(base.legal?.[page.key]?.bodyMarkdown ?? {}),
                                                                    [lang]: next || undefined,
                                                                },
                                                            },
                                                        },
                                                    });
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </details>
        </div>
    );
}
