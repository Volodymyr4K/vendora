"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAdminJournalDraftAction, getAdminJournalListAction } from "@/app/actions";
import { ACCESS_DENIED_MESSAGE } from "@/app/actions-constants";
import { AccessDeniedBlock } from "../AccessDeniedBlock";
import { useAdminContext } from "../AdminContext";
import type { AdminJournalListItem } from "@/lib/server/mutations";

const MODULE_ID = "admin_content";

export default function AdminJournalPage({
    params,
}: {
    params: Promise<{ tenantSlug: string; branchSlug: string }>;
}) {
    const router = useRouter();
    const { canEdit } = useAdminContext();
    const canEditJournal = canEdit(MODULE_ID);

    const [tenantSlug, setTenantSlug] = useState("");
    const [branchSlug, setBranchSlug] = useState("");
    const [loading, setLoading] = useState(true);
    const [items, setItems] = useState<AdminJournalListItem[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [accessDenied, setAccessDenied] = useState(false);
    const [isPending, startTransition] = useTransition();
    const [statusFilter, setStatusFilter] = useState<"ALL" | "DRAFT" | "PUBLISHED">("ALL");
    const [query, setQuery] = useState("");

    const load = useCallback(
        async (ts: string, filter: "ALL" | "DRAFT" | "PUBLISHED") => {
            setLoading(true);
            setError(null);
            setAccessDenied(false);
            try {
                const res = await getAdminJournalListAction(ts, {
                    limit: 100,
                    status: filter === "ALL" ? undefined : filter,
                });
                setItems(res.items ?? []);
            } catch (e: unknown) {
                if (e instanceof Error && e.message === ACCESS_DENIED_MESSAGE) {
                    setAccessDenied(true);
                } else {
                    setError(e instanceof Error ? e.message : "Failed to load journal");
                }
            } finally {
                setLoading(false);
            }
        },
        []
    );

    useEffect(() => {
        params.then((p) => {
            setTenantSlug(p.tenantSlug);
            setBranchSlug(p.branchSlug);
        });
    }, [params]);

    useEffect(() => {
        if (!tenantSlug) return;
        void load(tenantSlug, statusFilter);
    }, [tenantSlug, statusFilter, load]);

    const root = useMemo(() => (tenantSlug && branchSlug ? `/t/${tenantSlug}/${branchSlug}` : ""), [tenantSlug, branchSlug]);
    const visibleItems = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return items;
        return items.filter((p) => {
            if (p.slug.toLowerCase().includes(q)) return true;
            const title = p.translations?.[0]?.title ?? "";
            if (title.toLowerCase().includes(q)) return true;
            return (p.translations ?? []).some((t) => (t.title ?? "").toLowerCase().includes(q));
        });
    }, [items, query]);

    if (accessDenied) return <AccessDeniedBlock />;

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div>
                    <h2 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>Journal</h2>
                    <div style={{ fontSize: 12, color: "var(--muted)" }}>
                        Drafts + published posts. Published posts are immutable; use unpublish to edit.
                    </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                        className="input"
                        style={{ height: 36, width: 220 }}
                        placeholder="Search title/slug..."
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />
                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                        className="input"
                        style={{ height: 36 }}
                    >
                        <option value="ALL">All</option>
                        <option value="DRAFT">Draft</option>
                        <option value="PUBLISHED">Published</option>
                    </select>
                    <button
                        type="button"
                        className="btn"
                        onClick={() => void load(tenantSlug, statusFilter)}
                        disabled={loading || isPending || !tenantSlug}
                    >
                        {loading ? "Loading..." : "Refresh"}
                    </button>
                    {canEditJournal ? (
                        <button
                            type="button"
                            className="btn"
                            disabled={loading || isPending || !tenantSlug}
                            onClick={() => {
                                setError(null);
                                startTransition(async () => {
                                    try {
                                        const res = await createAdminJournalDraftAction(tenantSlug, {
                                            translations: [{ locale: "en", title: "New post", excerpt: null, markdown: "" }],
                                        });
                                        router.push(`${root}/admin/journal/${res.id}`);
                                    } catch (e: unknown) {
                                        setError(e instanceof Error ? e.message : "Failed to create draft");
                                    }
                                });
                            }}
                        >
                            {isPending ? "Creating..." : "New draft"}
                        </button>
                    ) : null}
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

            <div style={{ border: "1px solid var(--line)", borderRadius: 10, overflow: "hidden" }}>
                <div style={{ display: "grid", gridTemplateColumns: "90px 1.2fr 0.9fr 140px", gap: 0, background: "var(--paper)" }}>
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>Status</div>
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>Slug / Title</div>
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>Locales</div>
                    <div style={{ padding: "10px 12px", fontSize: 12, color: "var(--muted)" }}>Updated</div>
                </div>
                <div style={{ background: "var(--bg)" }}>
                    {visibleItems.length === 0 ? (
                        <div style={{ padding: 14, fontSize: 13, color: "var(--muted)" }}>
                            {loading ? "Loading..." : (query.trim() ? "No matches." : "No posts yet.")}
                        </div>
                    ) : (
                        visibleItems.map((p) => {
                            const title = p.translations?.[0]?.title ?? "(no title yet)";
                            const locales = (p.translations ?? []).map((t) => t.locale).join(", ");
                            const missing = p.missingLocales?.length ? ` (missing: ${p.missingLocales.join(", ")})` : "";
                            const home = p.homeSlot ? `HOME ${p.homeSlot}` : null;
                            return (
                                <button
                                    key={p.id}
                                    type="button"
                                    onClick={() => router.push(`${root}/admin/journal/${p.id}`)}
                                    className="berlin-press-ink-hover"
                                    style={{
                                        width: "100%",
                                        textAlign: "left",
                                        display: "grid",
                                        gridTemplateColumns: "90px 1.2fr 0.9fr 140px",
                                        gap: 0,
                                        borderTop: "1px solid var(--line)",
                                        padding: 0,
                                        background: "transparent",
                                        cursor: "pointer",
                                    }}
                                >
                                    <div style={{ padding: "12px 12px", fontSize: 12, fontWeight: 700 }}>
                                        {p.status}
                                    </div>
                                    <div style={{ padding: "12px 12px" }}>
                                        <div style={{ fontSize: 12, color: "var(--muted)", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                                            <span>{p.slug}</span>
                                            {home ? (
                                                <span style={{ fontSize: 10, letterSpacing: "0.2em", fontWeight: 800, border: "1px solid var(--line)", padding: "2px 6px" }}>
                                                    {home}
                                                </span>
                                            ) : null}
                                        </div>
                                        <div style={{ fontSize: 14, fontWeight: 700 }}>{title}</div>
                                    </div>
                                    <div style={{ padding: "12px 12px", fontSize: 12, color: p.missingLocales?.length ? "var(--warning)" : "var(--muted)" }}>
                                        {locales || "—"}
                                        {missing}
                                    </div>
                                    <div style={{ padding: "12px 12px", fontSize: 12, color: "var(--muted)" }}>
                                        {p.updatedAt?.slice(0, 19).replace("T", " ") ?? "—"}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}
