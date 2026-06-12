import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getOrSet } from "../../cache/stale.js";
import type { RoutesDependencies } from "../../types/dependencies.js";
import { validateTenant } from "../../plugins/tenant-guard.js";
import type { Prisma } from "@vendora/database";

function normalizeLocale(value: string | undefined): string | null {
    if (!value) return null;
    const v = value.trim();
    if (!v) return null;
    // de-DE -> de, en_US -> en
    const primary = v.split(/[-_]/)[0];
    return (primary || v).toLowerCase();
}

function decodeCursor(cursor: string): { publishedAt: Date; id: string } {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = z
        .object({
            publishedAt: z.string().datetime(),
            id: z.string().min(1),
        })
        .parse(JSON.parse(raw));

    return { publishedAt: new Date(parsed.publishedAt), id: parsed.id };
}

function tryDecodeCursor(cursor: string | undefined): { publishedAt: Date; id: string } | null {
    if (!cursor) return null;
    try {
        return decodeCursor(cursor);
    } catch {
        return null;
    }
}

function encodeCursor(value: { publishedAt: Date; id: string }): string {
    const raw = JSON.stringify({
        publishedAt: value.publishedAt.toISOString(),
        id: value.id,
    });
    return Buffer.from(raw, "utf8").toString("base64url");
}

function pickTranslation<T extends { locale: string }>(
    translations: T[],
    requestedLocale: string | null
): T | null {
    if (translations.length === 0) return null;
    const req = normalizeLocale(requestedLocale ?? undefined);
    if (req) {
        const match = translations.find((t) => normalizeLocale(t.locale) === req);
        if (match) return match;
    }
    const en = translations.find((t) => normalizeLocale(t.locale) === "en");
    if (en) return en;
    return translations[0] ?? null;
}

const zJournalListQuery = z.object({
    cursor: z.string().optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
    locale: z.string().optional(),
});

const zJournalHomeQuery = z.object({
    locale: z.string().optional(),
});

const zJournalBySlugParams = z.object({
    slug: z.string().min(1),
});

export async function routesJournal(app: FastifyInstance, deps: RoutesDependencies) {
    // GET /journal - public list (published only)
    app.get<{ Querystring: z.infer<typeof zJournalListQuery> }>("/journal", {
        schema: { querystring: zJournalListQuery },
    }, async (req, reply) => {
        const tenant = validateTenant(req);
        const q = req.query ?? {};
        const limit = q.limit ?? 20;
        const requestedLocale =
            normalizeLocale(q.locale) ??
            normalizeLocale(typeof req.headers["x-am-locale"] === "string" ? req.headers["x-am-locale"] : undefined);

        const cursor = tryDecodeCursor(q.cursor);
        if (q.cursor && !cursor) {
            return reply.code(400).send({ error: "Invalid cursor" });
        }

        const where: Prisma.JournalPostWhereInput = {
            tenantId: tenant.id,
            status: "PUBLISHED" as const,
            publishedAt: { not: null },
            ...(cursor
                ? {
                    OR: [
                        { publishedAt: { lt: cursor.publishedAt } },
                        { publishedAt: cursor.publishedAt, id: { lt: cursor.id } },
                    ],
                }
                : {}),
        };

        const rows = await deps.prisma.journalPost.findMany({
            where,
            orderBy: [{ publishedAt: "desc" }, { id: "desc" }],
            take: limit + 1,
            select: {
                id: true,
                slug: true,
                publishedAt: true,
                coverImageKey: true,
                translations: {
                    orderBy: { locale: "asc" },
                    select: {
                        locale: true,
                        title: true,
                        excerpt: true,
                    },
                },
            },
        });

        const hasMore = rows.length > limit;
        const slice = hasMore ? rows.slice(0, limit) : rows;
        const last = slice.at(-1);

        const items = slice.map((p) => {
            const translation = pickTranslation(p.translations, requestedLocale);
            return {
                id: p.id,
                slug: p.slug,
                publishedAt: p.publishedAt?.toISOString() ?? null,
                coverImageKey: p.coverImageKey ?? null,
                locale: translation?.locale ?? null,
                title: translation?.title ?? null,
                excerpt: translation?.excerpt ?? null,
            };
        });

        return reply.send({
            items,
            nextCursor: hasMore && last?.publishedAt ? encodeCursor({ publishedAt: last.publishedAt, id: last.id }) : null,
        });
    });

    // GET /journal/home - public homepage picks (published only, ordered by homeSlot asc)
    app.get<{ Querystring: z.infer<typeof zJournalHomeQuery> }>("/journal/home", {
        schema: { querystring: zJournalHomeQuery },
    }, async (req, reply) => {
        const tenant = validateTenant(req);
        const requestedLocale =
            normalizeLocale(req.query?.locale) ??
            normalizeLocale(typeof req.headers["x-am-locale"] === "string" ? req.headers["x-am-locale"] : undefined);
        const effectiveLocale = requestedLocale ?? "default";
        const key = `journal:home:${tenant.id}:${effectiveLocale}`;

        const r = await getOrSet(
            deps.cache,
            key,
            60,
            600,
            async () => {
                const rows = await deps.prisma.journalPost.findMany({
                    where: {
                        tenantId: tenant.id,
                        status: "PUBLISHED" as const,
                        publishedAt: { not: null },
                        homeSlot: { not: null },
                    },
                    orderBy: [{ homeSlot: "asc" }, { publishedAt: "desc" }, { id: "desc" }],
                    take: 3,
                    select: {
                        id: true,
                        slug: true,
                        publishedAt: true,
                        coverImageKey: true,
                        homeSlot: true,
                        translations: {
                            orderBy: { locale: "asc" },
                            select: {
                                locale: true,
                                title: true,
                                excerpt: true,
                            },
                        },
                    },
                });

                const items = rows
                    .sort((a, b) => (a.homeSlot ?? 999) - (b.homeSlot ?? 999))
                    .map((p) => {
                        const translation = pickTranslation(p.translations, requestedLocale);
                        return {
                            id: p.id,
                            slug: p.slug,
                            homeSlot: p.homeSlot ?? null,
                            publishedAt: p.publishedAt?.toISOString() ?? null,
                            coverImageKey: p.coverImageKey ?? null,
                            locale: translation?.locale ?? null,
                            title: translation?.title ?? null,
                            excerpt: translation?.excerpt ?? null,
                        };
                    });

                return { items };
            },
            { swr: deps.swr, onRevalidateError: (e) => app.log.warn({ err: e }, "journal/home revalidate failed") }
        );

        deps.metrics?.cacheResult.inc({ key, result: r.from });
        reply.header("x-cache", r.from);
        reply.header("x-cache-age", String(Math.floor(r.ageSec)));
        return reply.send(r.data);
    });

    // GET /journal/:slug - public article (published only)
    app.get<{ Params: z.infer<typeof zJournalBySlugParams>; Querystring: { locale?: string } }>("/journal/:slug", {
        schema: { params: zJournalBySlugParams },
    }, async (req, reply) => {
        const tenant = validateTenant(req);
        const requestedLocale =
            normalizeLocale(req.query?.locale) ??
            normalizeLocale(typeof req.headers["x-am-locale"] === "string" ? req.headers["x-am-locale"] : undefined);

        const post = await deps.prisma.journalPost.findFirst({
            where: {
                tenantId: tenant.id,
                slug: req.params.slug,
                status: "PUBLISHED",
                publishedAt: { not: null },
            },
            select: {
                id: true,
                slug: true,
                publishedAt: true,
                coverImageKey: true,
                translations: {
                    orderBy: { locale: "asc" },
                    select: {
                        locale: true,
                        title: true,
                        excerpt: true,
                        markdown: true,
                    },
                },
            },
        });

        if (!post) {
            return reply.code(404).send({ error: "Not found" });
        }

        const translation = pickTranslation(post.translations, requestedLocale);
        if (!translation) {
            return reply.code(404).send({ error: "Not found" });
        }

        return reply.send({
            id: post.id,
            slug: post.slug,
            publishedAt: post.publishedAt?.toISOString() ?? null,
            coverImageKey: post.coverImageKey ?? null,
            locale: translation.locale,
            title: translation.title,
            excerpt: translation.excerpt ?? null,
            markdown: translation.markdown,
        });
    });
}
