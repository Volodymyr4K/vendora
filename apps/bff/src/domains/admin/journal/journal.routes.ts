import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { AM_LOCALES } from "@vendora/contracts";
import type { Prisma } from "@vendora/database";
import type { AdminDeps } from "../types.js";
import { slugify } from "../../../services/normalize/index.js";

function normalizeLocale(value: string): string {
    const v = String(value ?? "").trim();
    const primary = v.split(/[-_]/)[0] ?? v;
    return primary.toLowerCase();
}

async function ensureUniqueSlug(
    deps: AdminDeps,
    tenantId: string,
    desired: string,
    excludeId?: string
): Promise<string> {
    const base = slugify(desired);
    let candidate = base;
    for (let i = 0; i < 50; i++) {
        const exists = await deps.prisma.journalPost.findFirst({
            where: {
                tenantId,
                slug: candidate,
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            select: { id: true },
        });
        if (!exists) return candidate;
        candidate = `${base}-${i + 2}`;
    }
    // Extremely unlikely, but fail closed.
    throw new Error("Unable to generate unique slug");
}

const zTranslationInput = z.object({
    locale: z.string().min(1),
    title: z.string().min(1),
    excerpt: z.string().min(1).optional().nullable(),
    markdown: z.string().optional().default(""),
});

const zCreateDraft = z.object({
    slug: z.string().min(1).optional(),
    coverImageKey: z.string().min(1).optional().nullable(),
    translations: z.array(zTranslationInput).min(1),
});

const zPatchDraft = z.object({
    slug: z.string().min(1).optional(),
    coverImageKey: z.string().min(1).optional().nullable(),
    translations: z.array(zTranslationInput).min(1).optional(),
});

const zHomeSlotBody = z.object({
    homeSlot: z.coerce.number().int().min(1).max(3).nullable(),
});

const zListQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(100).optional(),
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
});

function encodeCursor(value: { updatedAt: Date; id: string }): string {
    return Buffer.from(JSON.stringify({ updatedAt: value.updatedAt.toISOString(), id: value.id }), "utf8").toString("base64url");
}

function decodeCursor(raw: string): { updatedAt: Date; id: string } {
    const parsed = z
        .object({ updatedAt: z.string().datetime(), id: z.string().min(1) })
        .parse(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
    return { updatedAt: new Date(parsed.updatedAt), id: parsed.id };
}

function tryDecodeCursor(raw: string | undefined): { updatedAt: Date; id: string } | null {
    if (!raw) return null;
    try {
        return decodeCursor(raw);
    } catch {
        return null;
    }
}

function requiredJournalLocales(): readonly string[] {
    // v1: Journal locales follow AM content locales.
    return AM_LOCALES;
}

function assertPublishable(translations: Array<{ locale: string; title: string; markdown: string }>) {
    const required = requiredJournalLocales().map(normalizeLocale);
    const byLocale = new Map<string, { title: string; markdown: string }>();
    for (const t of translations) {
        byLocale.set(normalizeLocale(t.locale), { title: t.title, markdown: t.markdown });
    }

    const missing = required.filter((l) => !byLocale.has(l));
    if (missing.length > 0) {
        throw { statusCode: 400, error: "Missing required locales", code: "MISSING_LOCALES", locales: missing };
    }

    const empty = required.filter((l) => {
        const v = byLocale.get(l);
        if (!v) return true;
        return v.title.trim().length === 0 || v.markdown.trim().length === 0;
    });
    if (empty.length > 0) {
        throw { statusCode: 400, error: "Empty title/markdown for locales", code: "EMPTY_LOCALE_FIELDS", locales: empty };
    }
}

export const journalAdminRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // List (drafts + published)
    app.get("/journal", {
        schema: { querystring: zListQuery },
    }, async (req, reply) => {
        const tenantId = req.tenant!.id;
        const q = req.query as z.infer<typeof zListQuery>;
        const limit = q.limit ?? 50;
        const cursor = tryDecodeCursor(q.cursor);
        if (q.cursor && !cursor) {
            return reply.code(400).send({ error: "Invalid cursor" });
        }

        const rows = await deps.prisma.journalPost.findMany({
            where: {
                tenantId,
                ...(q.status ? { status: q.status } : {}),
                ...(cursor
                    ? {
                        OR: [
                            { updatedAt: { lt: cursor.updatedAt } },
                            { updatedAt: cursor.updatedAt, id: { lt: cursor.id } },
                        ],
                    }
                    : {}),
            },
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            take: limit + 1,
            select: {
                id: true,
                slug: true,
                status: true,
                publishedAt: true,
                coverImageKey: true,
                homeSlot: true,
                updatedAt: true,
                translations: {
                    orderBy: { locale: "asc" },
                    select: { locale: true, title: true },
                },
            },
        });

        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        const last = slice.at(-1);

        const required = requiredJournalLocales().map(normalizeLocale);
        const items = slice.map((p) => {
            const present = new Set(p.translations.map((t) => normalizeLocale(t.locale)));
            const missingLocales = required.filter((l) => !present.has(l));
            return {
                id: p.id,
                slug: p.slug,
                status: p.status,
                publishedAt: p.publishedAt?.toISOString() ?? null,
                coverImageKey: p.coverImageKey ?? null,
                homeSlot: p.homeSlot ?? null,
                updatedAt: p.updatedAt.toISOString(),
                translations: p.translations,
                missingLocales,
            };
        });

        return reply.send({
            items,
            nextCursor: hasMore && last ? encodeCursor({ updatedAt: last.updatedAt, id: last.id }) : null,
        });
    });

    // Get one (full editor payload)
    app.get<{ Params: { id: string } }>("/journal/:id", async (req, reply) => {
        const tenantId = req.tenant!.id;
        const post = await deps.prisma.journalPost.findFirst({
            where: { tenantId, id: req.params.id },
            select: {
                id: true,
                slug: true,
                status: true,
                publishedAt: true,
                coverImageKey: true,
                homeSlot: true,
                createdAt: true,
                updatedAt: true,
                translations: {
                    orderBy: { locale: "asc" },
                    select: { locale: true, title: true, excerpt: true, markdown: true, updatedAt: true },
                },
            },
        });
        if (!post) return reply.code(404).send({ error: "Not found" });
        return reply.send({
            ...post,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            createdAt: post.createdAt.toISOString(),
            updatedAt: post.updatedAt.toISOString(),
            homeSlot: post.homeSlot ?? null,
            translations: post.translations.map((t) => ({
                ...t,
                excerpt: t.excerpt ?? null,
                updatedAt: t.updatedAt.toISOString(),
            })),
        });
    });

    // Set/clear homepage slot (allowed for both drafts and published; does not modify content)
    app.put<{ Params: { id: string }; Body: z.infer<typeof zHomeSlotBody> }>("/journal/:id/home-slot", {
        schema: { body: zHomeSlotBody },
    }, async (req, reply) => {
        const tenantId = req.tenant!.id;
        const id = req.params.id;

        const current = await deps.prisma.journalPost.findFirst({
            where: { tenantId, id },
            select: { id: true },
        });
        if (!current) return reply.code(404).send({ error: "Not found" });

        const requestedSlot = req.body.homeSlot;
        const updated = await deps.prisma.$transaction(async (tx) => {
            if (requestedSlot !== null) {
                await tx.journalPost.updateMany({
                    where: { tenantId, homeSlot: requestedSlot, id: { not: id } },
                    data: { homeSlot: null },
                });
            }

            return tx.journalPost.update({
                where: { id },
                data: { homeSlot: requestedSlot },
                select: { id: true, homeSlot: true, updatedAt: true },
            });
        });

        return reply.send({
            id: updated.id,
            homeSlot: updated.homeSlot ?? null,
            updatedAt: updated.updatedAt.toISOString(),
        });
    });

    // Create draft
    app.post<{ Body: z.infer<typeof zCreateDraft> }>("/journal", {
        schema: { body: zCreateDraft },
    }, async (req, reply) => {
        const tenantId = req.tenant!.id;
        const body = req.body;

        const normalizedTranslations = body.translations.map((t) => ({
            locale: normalizeLocale(t.locale),
            title: t.title,
            excerpt: t.excerpt ?? null,
            markdown: t.markdown ?? "",
        }));
        const localeSet = new Set(normalizedTranslations.map((t) => t.locale));
        if (localeSet.size !== normalizedTranslations.length) {
            return reply.code(400).send({ error: "Duplicate locales" });
        }

        const slugSeed =
            body.slug ??
            normalizedTranslations.find((t) => t.locale === "en")?.title ??
            normalizedTranslations[0]?.title ??
            "journal-post";
        const slug = await ensureUniqueSlug(deps, tenantId, slugSeed);

        const post = await deps.prisma.journalPost.create({
            data: {
                tenantId,
                slug,
                status: "DRAFT",
                coverImageKey: body.coverImageKey ?? null,
                translations: {
                    create: normalizedTranslations,
                },
            },
            select: { id: true, slug: true, status: true },
        });

        return reply.code(201).send(post);
    });

    // Update draft (reject if published)
    app.patch<{ Params: { id: string }; Body: z.infer<typeof zPatchDraft> }>("/journal/:id", {
        schema: { body: zPatchDraft },
    }, async (req, reply) => {
        const tenantId = req.tenant!.id;
        const id = req.params.id;

        const current = await deps.prisma.journalPost.findFirst({
            where: { tenantId, id },
            select: { id: true, status: true },
        });
        if (!current) return reply.code(404).send({ error: "Not found" });
        if (current.status === "PUBLISHED") {
            return reply.code(409).send({ error: "Published posts are immutable", code: "IMMUTABLE_PUBLISHED" });
        }

        const data: Prisma.JournalPostUpdateInput = {};
        if (req.body.coverImageKey !== undefined) data.coverImageKey = req.body.coverImageKey ?? null;

        if (req.body.slug !== undefined) {
            const nextSlug = await ensureUniqueSlug(deps, tenantId, req.body.slug, id);
            data.slug = nextSlug;
        }

        const translations = req.body.translations;
        if (translations) {
            const normalized = translations.map((t) => ({
                locale: normalizeLocale(t.locale),
                title: t.title,
                excerpt: t.excerpt ?? null,
                markdown: t.markdown ?? "",
            }));
            const localeSet = new Set(normalized.map((t) => t.locale));
            if (localeSet.size !== normalized.length) {
                return reply.code(400).send({ error: "Duplicate locales" });
            }
            // Upsert each translation by (postId, locale)
            data.translations = {
                upsert: normalized.map((t) => ({
                    where: { postId_locale: { postId: id, locale: t.locale } },
                    create: { locale: t.locale, title: t.title, excerpt: t.excerpt, markdown: t.markdown },
                    update: { title: t.title, excerpt: t.excerpt, markdown: t.markdown },
                })),
            };
        }

        const updated = await deps.prisma.journalPost.update({
            where: { id },
            data,
            select: { id: true, slug: true, status: true, updatedAt: true },
        });
        return reply.send({ ...updated, updatedAt: updated.updatedAt.toISOString() });
    });

    // Delete draft (reject if published)
    app.delete<{ Params: { id: string } }>("/journal/:id", async (req, reply) => {
        const tenantId = req.tenant!.id;
        const id = req.params.id;
        const current = await deps.prisma.journalPost.findFirst({
            where: { tenantId, id },
            select: { id: true, status: true },
        });
        if (!current) return reply.code(404).send({ error: "Not found" });
        if (current.status === "PUBLISHED") {
            return reply.code(409).send({ error: "Published posts cannot be deleted", code: "IMMUTABLE_PUBLISHED" });
        }
        await deps.prisma.journalPost.delete({ where: { id } });
        return reply.send({ success: true });
    });

    // Publish (requires all locales)
    app.post<{ Params: { id: string } }>("/journal/:id/publish", async (req, reply) => {
        const tenantId = req.tenant!.id;
        const id = req.params.id;

        const post = await deps.prisma.journalPost.findFirst({
            where: { tenantId, id },
            select: {
                id: true,
                status: true,
                translations: { select: { locale: true, title: true, markdown: true } },
            },
        });
        if (!post) return reply.code(404).send({ error: "Not found" });
        if (post.status === "PUBLISHED") {
            return reply.code(409).send({ error: "Already published", code: "ALREADY_PUBLISHED" });
        }

        try {
            assertPublishable(post.translations);
        } catch (err: unknown) {
            if (err && typeof err === "object" && "statusCode" in err) {
                const e = err as { statusCode: number; error: string; code?: string; locales?: string[] };
                return reply.code(e.statusCode).send({ error: e.error, code: e.code, locales: e.locales });
            }
            throw err;
        }

        const updated = await deps.prisma.journalPost.update({
            where: { id },
            data: { status: "PUBLISHED", publishedAt: new Date() },
            select: { id: true, slug: true, status: true, publishedAt: true },
        });

        return reply.send({
            ...updated,
            publishedAt: updated.publishedAt?.toISOString() ?? null,
        });
    });

    // Unpublish (allowed, no content changes)
    app.post<{ Params: { id: string } }>("/journal/:id/unpublish", async (req, reply) => {
        const tenantId = req.tenant!.id;
        const id = req.params.id;

        const post = await deps.prisma.journalPost.findFirst({
            where: { tenantId, id },
            select: { id: true, status: true },
        });
        if (!post) return reply.code(404).send({ error: "Not found" });
        if (post.status !== "PUBLISHED") {
            return reply.code(409).send({ error: "Not published", code: "NOT_PUBLISHED" });
        }

        const updated = await deps.prisma.journalPost.update({
            where: { id },
            data: { status: "DRAFT", publishedAt: null },
            select: { id: true, slug: true, status: true, publishedAt: true },
        });

        return reply.send({
            ...updated,
            publishedAt: updated.publishedAt?.toISOString() ?? null,
        });
    });
};
