"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AM_LOCALES } from "@vendora/contracts";
import {
    deleteAdminJournalDraftAction,
    getAdminJournalPostAction,
    patchAdminJournalDraftAction,
    publishAdminJournalPostAction,
    renderJournalMarkdownPreviewAction,
    setAdminJournalHomeSlotAction,
    unpublishAdminJournalPostAction,
    uploadFileAction,
} from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { AccessDeniedBlock } from "../../AccessDeniedBlock";
import { useAdminContext } from "../../AdminContext";
import type { AdminJournalPost, JournalTranslationInput } from "@/lib/server/mutations";

const MODULE_ID = "admin_content";

type Locale = (typeof AM_LOCALES)[number];

function formatDate(value: string | null | undefined): string {
    if (!value) return "—";
    return value.slice(0, 19).replace("T", " ");
}

function buildPatchPayload(post: AdminJournalPost): { slug?: string; coverImageKey?: string | null; translations?: JournalTranslationInput[] } {
    return {
        slug: post.slug,
        coverImageKey: post.coverImageKey,
        translations: post.translations.map((t) => ({
            locale: t.locale,
            title: t.title,
            excerpt: t.excerpt ?? null,
            markdown: t.markdown,
        })),
    };
}

function requiredLocales(): readonly Locale[] {
    return AM_LOCALES;
}

function missingPublishLocales(post: AdminJournalPost): Locale[] {
    const required = new Set(requiredLocales());
    const present = new Set(post.translations.map((t) => t.locale as Locale));
    return [...required].filter((l) => !present.has(l));
}

function emptyPublishLocales(post: AdminJournalPost): Locale[] {
    const required = requiredLocales();
    const byLocale = new Map(post.translations.map((t) => [t.locale, t]));
    return required.filter((l) => {
        const t = byLocale.get(l);
        if (!t) return true;
        return t.title.trim().length === 0 || t.markdown.trim().length === 0;
    });
}

export default function AdminJournalEditorPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; branchSlug: string; id: string }>;
}) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { canEdit } = useAdminContext();
    const canEditJournal = canEdit(MODULE_ID);

    const [tenantSlug, setTenantSlug] = useState("");
    const [branchSlug, setBranchSlug] = useState("");
    const [id, setId] = useState("");

    const [loading, setLoading] = useState(true);
    const [isPending, startTransition] = useTransition();
    const [error, setError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);

    const [post, setPost] = useState<AdminJournalPost | null>(null);
    const [lastSavedJson, setLastSavedJson] = useState<string | null>(null);

    const [activeLocale, setActiveLocale] = useState<Locale>("en");
    const [previewHtml, setPreviewHtml] = useState<string>("");
    const [previewing, setPreviewing] = useState(false);
    const [pendingHomeSlot, setPendingHomeSlot] = useState<string>("");

    useEffect(() => {
        const qpLocale = searchParams.get("locale");
        if (!qpLocale) return;
        const normalized = qpLocale.toLowerCase() as Locale;
        if (requiredLocales().includes(normalized)) {
            setActiveLocale(normalized);
        }
    }, [searchParams]);

    useEffect(() => {
        params.then((p) => {
            setTenantSlug(p.tenantSlug);
            setBranchSlug(p.branchSlug);
            setId(p.id);
            load(p.tenantSlug, p.id);
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [params]);

    const root = useMemo(() => (tenantSlug && branchSlug ? `/t/${tenantSlug}/${branchSlug}` : ""), [tenantSlug, branchSlug]);

    async function load(ts: string, postId: string) {
        setLoading(true);
        setError(null);
        setAccessDenied(false);
        try {
            const res = await getAdminJournalPostAction(ts, postId);
            setPost(res);
            setLastSavedJson(JSON.stringify(res));
            setPendingHomeSlot(res.homeSlot ? String(res.homeSlot) : "");
            const required = requiredLocales();
            if (!required.includes(activeLocale)) setActiveLocale("en");
        } catch (e: unknown) {
            if (e instanceof Error && e.message === ACCESS_DENIED_MESSAGE) {
                setAccessDenied(true);
            } else {
                setError(e instanceof Error ? e.message : "Failed to load post");
            }
        } finally {
            setLoading(false);
        }
    }

    if (accessDenied) return <AccessDeniedBlock />;

    const isDraft = post?.status === "DRAFT";
    const isPublished = post?.status === "PUBLISHED";
    const hasUnsavedChanges = post && lastSavedJson !== null && JSON.stringify(post) !== lastSavedJson;

    const missingLocales = post ? missingPublishLocales(post) : [];
    const emptyLocales = post ? emptyPublishLocales(post) : [];
    const canPublish = Boolean(post) && isDraft && missingLocales.length === 0 && emptyLocales.length === 0;

    const activeTranslation = useMemo(() => {
        if (!post) return null;
        const t = post.translations.find((x) => x.locale === activeLocale);
        if (t) return t;
        return null;
    }, [post, activeLocale]);

    const publicHref = post ? `/t/${tenantSlug}/journal/${post.slug}` : "";
    const adminPreviewHref = post
        ? `${root}/admin/journal/${post.id}?preview=1&locale=${encodeURIComponent(activeLocale)}`
        : "";

    useEffect(() => {
        const shouldOpen = searchParams.get("preview") === "1";
        if (!shouldOpen) return;
        if (!activeTranslation) return;
        if (previewing) return;

        setError(null);
        startTransition(async () => {
            try {
                const html = await renderJournalMarkdownPreviewAction(activeTranslation.markdown);
                setPreviewHtml(html);
                setPreviewing(true);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to render preview");
            }
        });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeTranslation?.markdown, activeLocale, searchParams]);

    const onSave = () => {
        if (!post) return;
        if (!canEditJournal) return;
        if (!isDraft) {
            setError("Published posts are immutable. Unpublish to edit.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                const payload = buildPatchPayload(post);
                const res = await patchAdminJournalDraftAction(tenantSlug, post.id, payload);
                setLastSavedJson(JSON.stringify({ ...post, updatedAt: res.updatedAt }));
                await load(tenantSlug, post.id);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to save");
            }
        });
    };

    const onDelete = () => {
        if (!post) return;
        if (!canEditJournal) return;
        if (!isDraft) {
            setError("Cannot delete a published post. Unpublish first.");
            return;
        }
        if (!window.confirm("Delete this draft? This cannot be undone.")) return;
        setError(null);
        startTransition(async () => {
            try {
                await deleteAdminJournalDraftAction(tenantSlug, post.id);
                router.push(`${root}/admin/journal`);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to delete");
            }
        });
    };

    const onPublish = () => {
        if (!post) return;
        if (!canEditJournal) return;
        if (!isDraft) return;
        if (!canPublish) {
            const missing = missingLocales.length ? `Missing locales: ${missingLocales.join(", ")}` : "";
            const empty = emptyLocales.length ? `Empty title/markdown: ${emptyLocales.join(", ")}` : "";
            setError([missing, empty].filter(Boolean).join(" • ") || "Not publishable yet.");
            return;
        }
        setError(null);
        startTransition(async () => {
            try {
                await publishAdminJournalPostAction(tenantSlug, post.id);
                setPreviewing(false);
                await load(tenantSlug, post.id);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to publish");
            }
        });
    };

    const onUnpublish = () => {
        if (!post) return;
        if (!canEditJournal) return;
        if (!isPublished) return;
        if (!window.confirm("Unpublish this post? It will disappear from public Journal until published again.")) return;
        setError(null);
        startTransition(async () => {
            try {
                await unpublishAdminJournalPostAction(tenantSlug, post.id);
                setPreviewing(false);
                await load(tenantSlug, post.id);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to unpublish");
            }
        });
    };

    const onPreview = () => {
        if (!activeTranslation) return;
        setError(null);
        if (activeTranslation.markdown.trim().length === 0) {
            setPreviewHtml("");
            setPreviewing(true);
            return;
        }
        startTransition(async () => {
            try {
                const html = await renderJournalMarkdownPreviewAction(activeTranslation.markdown);
                setPreviewHtml(html);
                setPreviewing(true);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to render preview");
            }
        });
    };

    const onUpdateHomeSlot = () => {
        if (!post) return;
        if (!canEditJournal) return;
        setError(null);
        const next = pendingHomeSlot.trim().length ? Number(pendingHomeSlot) : null;
        startTransition(async () => {
            try {
                await setAdminJournalHomeSlotAction(tenantSlug, post.id, next);
                await load(tenantSlug, post.id);
            } catch (e: unknown) {
                setError(e instanceof Error ? e.message : "Failed to update homepage slot");
            }
        });
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                        <Link
                            className="btn"
                            href={`${root}/admin/journal`}
                            style={{ textDecoration: "none" }}
                        >
                            ← Back
                        </Link>
                        {post ? (
                            <span style={{ fontSize: 12, color: "var(--muted)" }}>
                                {post.status} • Updated {formatDate(post.updatedAt)}
                            </span>
                        ) : null}
                    </div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
                        {post ? `Journal: ${post.slug}` : "Journal"}
                    </h2>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Published posts are immutable. Unpublish to edit.
                    </div>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <button
                        type="button"
                        className="btn"
                        onClick={() => load(tenantSlug, id)}
                        disabled={loading || isPending || !tenantSlug || !id}
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                    <button
                        type="button"
                        className="btn"
                        onClick={onSave}
                        disabled={!canEditJournal || !isDraft || isPending || loading || !hasUnsavedChanges}
                    >
                        {isPending ? "Saving..." : "Save"}
                    </button>
                    <button
                        type="button"
                        className="btn"
                        onClick={onPublish}
                        disabled={!canEditJournal || !canPublish || isPending || loading}
                        title={missingLocales.length || emptyLocales.length ? `Missing: ${missingLocales.join(", ")}; Empty: ${emptyLocales.join(", ")}` : undefined}
                    >
                        Publish
                    </button>
                    <button
                        type="button"
                        className="btn"
                        onClick={onUnpublish}
                        disabled={!canEditJournal || !isPublished || isPending || loading}
                    >
                        Unpublish
                    </button>
                    <button
                        type="button"
                        className="btn"
                        onClick={onDelete}
                        disabled={!canEditJournal || !isDraft || isPending || loading}
                    >
                        Delete
                    </button>
                </div>
            </div>

            {error ? (
                <div className="bg-danger-weak text-danger" style={{ padding: 10, borderRadius: 8 }}>
                    {error}
                </div>
            ) : null}

            {!canEditJournal ? (
                <div className="bg-warning-weak text-warning" style={{ padding: 10, borderRadius: 8, fontSize: 12 }}>
                    Read-only: you do not have permission to edit content.
                </div>
            ) : null}

            {post ? (
                <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                    <div style={{ padding: 14, background: "var(--paper)", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", justifyContent: "space-between" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <span style={{ fontSize: 12, color: "var(--muted)" }}>Slug</span>
                                <input
                                    className="input"
                                    style={{ height: 34, width: 260 }}
                                    value={post.slug}
                                    onChange={(e) => setPost((prev) => (prev ? { ...prev, slug: e.target.value } : prev))}
                                    disabled={!canEditJournal || !isDraft}
                                />
                            </label>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                Public URL:{" "}
                                <Link href={publicHref} target="_blank" rel="noreferrer" className="text-info">
                                    {publicHref}
                                </Link>
                                {!isPublished ? (
                                    <>
                                        {" "}
                                        <span style={{ color: "var(--muted)" }}>(will 404 until published)</span>
                                    </>
                                ) : null}
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>Homepage slot</div>
                            <select
                                className="input"
                                style={{ height: 34, minWidth: 90 }}
                                value={pendingHomeSlot}
                                disabled={!canEditJournal || isPending || loading}
                                onChange={(e) => setPendingHomeSlot(e.target.value)}
                                aria-label="Homepage slot"
                            >
                                <option value="">Off</option>
                                <option value="1">Slot 1</option>
                                <option value="2">Slot 2</option>
                                <option value="3">Slot 3</option>
                            </select>
                            <button
                                type="button"
                                className="btn"
                                onClick={onUpdateHomeSlot}
                                disabled={
                                    !canEditJournal ||
                                    isPending ||
                                    loading ||
                                    (pendingHomeSlot === (post.homeSlot ? String(post.homeSlot) : ""))
                                }
                                title="Controls which posts appear in the 3-line Journal block on the homepage."
                            >
                                Apply
                            </button>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--muted)" }}>
                            Created {formatDate(post.createdAt)} • Published {formatDate(post.publishedAt)}
                        </div>
                    </div>

                    {!isPublished ? (
                        <div style={{ padding: 14, borderTop: "1px solid var(--line)", background: "var(--bg)" }}>
                            <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>Full-page preview (admin-only):</div>
                                <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                    <Link className="btn" href={adminPreviewHref} target="_blank" rel="noreferrer">
                                        Open full preview
                                    </Link>
                                    {!canPublish ? (
                                        <span style={{ fontSize: 12, color: "var(--warning)" }}>
                                            Publish requires all locales ({requiredLocales().join(", ")}) with non-empty title + markdown.
                                        </span>
                                    ) : (
                                        <span style={{ fontSize: 12, color: "var(--muted)" }}>Ready to publish.</span>
                                    )}
                                </div>
                            </div>
                            {!canPublish ? (
                                <div style={{ marginTop: 10, fontSize: 12, color: "var(--muted)", lineHeight: 1.4 }}>
                                    {missingLocales.length ? (
                                        <div>
                                            Missing locales:{" "}
                                            <span style={{ color: "var(--warning)" }}>{missingLocales.join(", ")}</span>
                                        </div>
                                    ) : null}
                                    {emptyLocales.length ? (
                                        <div>
                                            Empty title/markdown:{" "}
                                            <span style={{ color: "var(--warning)" }}>{emptyLocales.join(", ")}</span>
                                        </div>
                                    ) : null}
                                </div>
                            ) : null}
                        </div>
                    ) : null}

                    <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
                        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
                            <div style={{ fontSize: 12, fontWeight: 800 }}>Cover</div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                Stored as `coverImageKey` (served via `/media/...`).
                            </div>
                        </div>

                        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
                            {post.coverImageKey ? (
                                <img
                                    src={`/media/${post.coverImageKey}`}
                                    alt=""
                                    style={{ width: 120, height: 80, objectFit: "cover", borderRadius: 8, border: "1px solid var(--line)" }}
                                />
                            ) : (
                                <div style={{ width: 120, height: 80, background: "var(--line)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, color: "var(--muted)" }}>
                                    No cover
                                </div>
                            )}

                            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                <input
                                    type="file"
                                    accept="image/png, image/jpeg, image/webp"
                                    disabled={!canEditJournal || !isDraft || isPending}
                                    onChange={async (e) => {
                                        const file = e.target.files?.[0];
                                        if (!file) return;
                                        if (file.size > 10 * 1024 * 1024) {
                                            setError("File is too large (Max 10MB)");
                                            return;
                                        }
                                        try {
                                            setError(null);
                                            e.target.disabled = true;
                                            const formData = new FormData();
                                            formData.append("file", file);
                                            const res = await uploadFileAction(formData, tenantSlug);
                                            if (!res.objectKey) throw new Error("Upload response missing objectKey");
                                            setPost((prev) => (prev ? { ...prev, coverImageKey: res.objectKey ?? null } : prev));
                                        } catch (err: unknown) {
                                            setError(err instanceof Error ? err.message : "Upload failed");
                                        } finally {
                                            e.target.disabled = false;
                                            e.target.value = "";
                                        }
                                    }}
                                />
                                <button
                                    type="button"
                                    className="btn"
                                    style={{ width: 160 }}
                                    disabled={!canEditJournal || !isDraft || isPending || !post.coverImageKey}
                                    onClick={() => setPost((prev) => (prev ? { ...prev, coverImageKey: null } : prev))}
                                >
                                    Remove cover
                                </button>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: 14, borderTop: "1px solid var(--line)" }}>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
                            <div style={{ fontSize: 12, fontWeight: 800, marginRight: 6 }}>Translations</div>
                            {requiredLocales().map((l) => {
                                const present = post.translations.some((t) => t.locale === l);
                                const active = activeLocale === l;
                                return (
                                    <button
                                        key={l}
                                        type="button"
                                        className="btn"
                                        style={{
                                            padding: "6px 10px",
                                            background: active ? "var(--line)" : "var(--paper)",
                                            color: present ? "var(--ink)" : "var(--warning)",
                                        }}
                                        onClick={() => {
                                            setActiveLocale(l);
                                            setPreviewing(false);
                                        }}
                                    >
                                        {l.toUpperCase()}
                                        {!present ? " (missing)" : ""}
                                    </button>
                                );
                            })}
                            <div style={{ marginLeft: "auto", display: "flex", gap: 10 }}>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={onPreview}
                                    disabled={isPending || loading || !activeTranslation}
                                >
                                    Markdown preview
                                </button>
                                <button
                                    type="button"
                                    className="btn"
                                    onClick={() => setPreviewing(false)}
                                    disabled={!previewing}
                                >
                                    Edit
                                </button>
                            </div>
                        </div>

                        {!activeTranslation ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <div style={{ fontSize: 12, color: "var(--muted)" }}>
                                    This locale is missing. Add it to continue.
                                </div>
                                <button
                                    type="button"
                                    className="btn"
                                    disabled={!canEditJournal || !isDraft}
                                    onClick={() => {
                                        setPost((prev) => {
                                            if (!prev) return prev;
                                            if (prev.translations.some((t) => t.locale === activeLocale)) return prev;
                                            return {
                                                ...prev,
                                                translations: [
                                                    ...prev.translations,
                                                    { locale: activeLocale, title: "", excerpt: null, markdown: "", updatedAt: prev.updatedAt },
                                                ],
                                            };
                                        });
                                    }}
                                >
                                    Add {activeLocale.toUpperCase()} translation
                                </button>
                            </div>
                        ) : previewing ? (
                            <div className="max-w-3xl text-ink">
                                <div className="mb-8">
                                    <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-muted mb-3">
                                        {activeLocale.toUpperCase()} • Markdown preview
                                    </div>
                                    <h1 className="text-4xl md:text-5xl font-serif leading-[0.92] text-ink">
                                        {activeTranslation.title?.trim() ? activeTranslation.title : "(no title yet)"}
                                    </h1>
                                    {activeTranslation.excerpt ? (
                                        <p className="font-mono text-[12px] text-muted max-w-2xl mt-4 leading-relaxed">
                                            {activeTranslation.excerpt}
                                        </p>
                                    ) : null}
                                    {post.coverImageKey ? (
                                        <div className="mt-6">
                                            <img
                                                src={`/media/${post.coverImageKey}`}
                                                alt=""
                                                className="w-full max-h-[420px] object-cover border border-line"
                                            />
                                        </div>
                                    ) : null}
                                </div>

                                {previewHtml.trim().length === 0 ? (
                                    <div className="font-mono text-[12px] text-muted">
                                        Nothing to preview yet — Markdown is empty.
                                    </div>
                                ) : (
                                    <div
                                        className={[
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
                                        dangerouslySetInnerHTML={{ __html: previewHtml }}
                                    />
                                )}
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700 }}>Title</span>
                                    <input
                                        className="input"
                                        style={{ height: 36 }}
                                        value={activeTranslation.title}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setPost((prev) => {
                                                if (!prev) return prev;
                                                return {
                                                    ...prev,
                                                    translations: prev.translations.map((t) => (t.locale === activeLocale ? { ...t, title: v } : t)),
                                                };
                                            });
                                        }}
                                        disabled={!canEditJournal || !isDraft}
                                    />
                                </label>

                                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700 }}>Excerpt (optional)</span>
                                    <textarea
                                        className="input"
                                        rows={3}
                                        value={activeTranslation.excerpt ?? ""}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setPost((prev) => {
                                                if (!prev) return prev;
                                                return {
                                                    ...prev,
                                                    translations: prev.translations.map((t) => (t.locale === activeLocale ? { ...t, excerpt: v || null } : t)),
                                                };
                                            });
                                        }}
                                        disabled={!canEditJournal || !isDraft}
                                    />
                                </label>

                                <label style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                    <span style={{ fontSize: 12, fontWeight: 700 }}>Markdown</span>
                                    <textarea
                                        className="input"
                                        rows={18}
                                        value={activeTranslation.markdown}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setPost((prev) => {
                                                if (!prev) return prev;
                                                return {
                                                    ...prev,
                                                    translations: prev.translations.map((t) => (t.locale === activeLocale ? { ...t, markdown: v } : t)),
                                                };
                                            });
                                        }}
                                        disabled={!canEditJournal || !isDraft}
                                        style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace" }}
                                    />
                                </label>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div style={{ padding: 14, color: "var(--muted)" }}>{loading ? "Loading..." : "Not found."}</div>
            )}
        </div>
    );
}
