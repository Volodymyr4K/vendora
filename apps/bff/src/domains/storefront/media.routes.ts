import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { RoutesDependencies } from "../../types/dependencies.js";
import { resolveTenant } from "../../services/tenant-resolver.js";
import { r2GetObject, r2HeadObject } from "../../services/r2.js";
import path from "node:path";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

const MEDIA_ROUTE_PREFIX = (process.env.MEDIA_ROUTE_PREFIX || "/media").trim().replace(/\/$/, "");
const CACHE_CONTROL_FALLBACK = "public, max-age=31536000, immutable";
const KEY_ALLOWLIST = /^[a-z0-9/_\-\.]+$/;
const LOCAL_MEDIA_DIR = process.env.LOCAL_MEDIA_DIR
    ? path.resolve(process.env.LOCAL_MEDIA_DIR)
    : path.resolve(process.cwd(), "./.local-media");

function isR2Configured(): boolean {
    return Boolean(
        process.env.R2_ENDPOINT &&
        process.env.R2_BUCKET &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY
    );
}

function normalizeTenantSlug(slug: string): string {
    return slug.trim().toLowerCase();
}

function getRequestHost(req: FastifyRequest): string | null {
    const raw = req.headers["x-forwarded-host"] || req.headers.host;
    if (!raw) return null;
    const host = Array.isArray(raw) ? raw[0] : raw;
    if (!host) return null;
    const primary = host.split(",")[0];
    if (!primary) return null;
    const trimmed = primary.trim();
    if (!trimmed) return null;
    const hostPart = trimmed.split(":")[0];
    if (!hostPart) return null;
    return hostPart.toLowerCase();
}

function isLocalDevHost(host: string): boolean {
    return host === "localhost" || host.endsWith(".localhost") || host === "127.0.0.1";
}

function decodeKey(rawKey: string): string | null {
    const lowered = rawKey.toLowerCase();
    if (lowered.includes("%2f") || lowered.includes("%5c")) {
        return null;
    }
    try {
        return decodeURIComponent(rawKey);
    } catch {
        return null;
    }
}

function hasDotDotSegment(key: string): boolean {
    return key.split("/").some(segment => segment === "..");
}

function isValidKey(key: string): boolean {
    if (!key || key.startsWith("/")) return false;
    if (key.includes("\\")) return false;
    if (hasDotDotSegment(key)) return false;
    return KEY_ALLOWLIST.test(key);
}

function fallbackContentType(key: string): string {
    const ext = path.extname(key).toLowerCase();
    switch (ext) {
        case ".webp": return "image/webp";
        case ".png": return "image/png";
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        case ".gif": return "image/gif";
        case ".svg": return "image/svg+xml";
        default: return "application/octet-stream";
    }
}

function etagMatches(ifNoneMatch: string, etag: string): boolean {
    return ifNoneMatch
        .split(",")
        .map(part => part.trim())
        .includes(etag);
}

function applyHeaders(
    reply: FastifyReply,
    key: string,
    meta: { contentType?: string; cacheControl?: string; etag?: string; contentLength?: number; lastModified?: Date }
) {
    const contentType = meta.contentType || fallbackContentType(key);
    reply.header("Content-Type", contentType);
    reply.header("Cache-Control", meta.cacheControl || CACHE_CONTROL_FALLBACK);
    if (meta.etag) reply.header("ETag", meta.etag);
    if (meta.contentLength !== undefined) reply.header("Content-Length", meta.contentLength);
    if (meta.lastModified) reply.header("Last-Modified", meta.lastModified.toUTCString());
}

function getLocalMediaPath(key: string): string | null {
    const base = path.resolve(LOCAL_MEDIA_DIR);
    const filePath = path.resolve(base, key);
    if (filePath !== base && !filePath.startsWith(`${base}${path.sep}`)) {
        return null;
    }
    return filePath;
}

async function resolveTenantSlug(deps: RoutesDependencies, req: FastifyRequest): Promise<string | null> {
    const host = getRequestHost(req);
    if (!host) return null;
    const result = await resolveTenant(deps.prisma, host);
    if (!result) return null;
    return normalizeTenantSlug(result.tenant.slug);
}

function inferTenantSlugFromKey(key: string): string | null {
    const m = key.match(/^t\/([a-z0-9-]+)\//);
    return m?.[1] ?? null;
}

export async function routesMedia(app: FastifyInstance, deps: RoutesDependencies) {
    const route = `${MEDIA_ROUTE_PREFIX}/*`;

    const handler = async (req: FastifyRequest, reply: FastifyReply, isHead: boolean) => {
        const rawKey = (req.params as { "*": string })["*"];
        const decoded = decodeKey(rawKey);
        if (!decoded) {
            return reply.code(400).send({ error: "Invalid media key" });
        }

        const normalizedKey = decoded.trim();
        if (!isValidKey(normalizedKey)) {
            return reply.code(400).send({ error: "Invalid media key" });
        }

        let tenantSlug = await resolveTenantSlug(deps, req);
        if (!tenantSlug) {
            // Local dev ergonomics: when running on localhost without a tenant-domain mapping,
            // infer the tenant slug from the object key itself.
            const host = getRequestHost(req);
            if (process.env.NODE_ENV !== "production" && host && isLocalDevHost(host)) {
                tenantSlug = inferTenantSlugFromKey(normalizedKey);
            }
            if (!tenantSlug) {
                return reply.code(404).send({ error: "Not found" });
            }
        }

        if (!normalizedKey.startsWith(`t/${tenantSlug}/`)) {
            return reply.code(404).send({ error: "Not found" });
        }

        const ifNoneMatch = typeof req.headers["if-none-match"] === "string"
            ? req.headers["if-none-match"]
            : undefined;

        try {
            if (!isR2Configured()) {
                const filePath = getLocalMediaPath(normalizedKey);
                if (!filePath) {
                    return reply.code(404).send({ error: "Not found" });
                }

                const st = await stat(filePath).catch(() => null);
                if (!st || !st.isFile()) {
                    return reply.code(404).send({ error: "Not found" });
                }

                const etag = `W/\"${st.size}-${Math.floor(st.mtimeMs)}\"`;
                applyHeaders(reply, normalizedKey, {
                    contentType: fallbackContentType(normalizedKey),
                    cacheControl: process.env.NODE_ENV === "production" ? CACHE_CONTROL_FALLBACK : "no-store",
                    etag,
                    contentLength: st.size,
                    lastModified: st.mtime ? new Date(st.mtime) : undefined
                });

                if (ifNoneMatch && etagMatches(ifNoneMatch, etag)) {
                    return reply.code(304).send();
                }
                if (isHead) {
                    return reply.code(200).send();
                }
                return reply.send(createReadStream(filePath));
            }

            let headMeta: Awaited<ReturnType<typeof r2HeadObject>> | undefined;

            if (ifNoneMatch || isHead) {
                headMeta = await r2HeadObject(normalizedKey);
                applyHeaders(reply, normalizedKey, headMeta);

                if (ifNoneMatch && headMeta.etag && etagMatches(ifNoneMatch, headMeta.etag)) {
                    return reply.code(304).send();
                }

                if (isHead) {
                    return reply.code(200).send();
                }
            }

            const obj = await r2GetObject(normalizedKey);
            applyHeaders(reply, normalizedKey, obj);
            return reply.send(obj.body);
        } catch (err: unknown) {
            const meta = err as { name?: string; $metadata?: { httpStatusCode?: number } };
            if (meta?.$metadata?.httpStatusCode === 404 || meta?.name === "NoSuchKey" || meta?.name === "NotFound") {
                return reply.code(404).send({ error: "Not found" });
            }
            req.log.error({ err }, "Media fetch failed");
            return reply.code(502).send({ error: "Media fetch failed" });
        }
    };

    app.get(route, async (req, reply) => handler(req, reply, false));
    app.head(route, async (req, reply) => handler(req, reply, true));
}
