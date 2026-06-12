import path from "path";
import { createWriteStream, existsSync, mkdirSync, unlinkSync } from "fs";
import { pipeline } from "node:stream/promises";
import { join, relative, normalize } from "path";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import sharp from "sharp";
import { logger } from "../lib/logger.js";
import { r2DeleteObject, r2PutObject } from "../services/r2.js";

function isR2Configured(): boolean {
    return Boolean(
        process.env.R2_ENDPOINT &&
        process.env.R2_BUCKET &&
        process.env.R2_ACCESS_KEY_ID &&
        process.env.R2_SECRET_ACCESS_KEY
    );
}

// Hardcoded path relative to BFF execution context
// We are in apps/bff/src/utils/fileStorage.ts
// We run from apps/bff
// Target: apps/web/public/uploads
const UPLOADS_DIR = path.resolve(process.cwd(), "../../apps/web/public/uploads");

// Ensure directory exists
if (!existsSync(UPLOADS_DIR)) {
    mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Local media fallback (when R2 is not configured).
// We keep this inside the BFF working directory so it is safe in containers.
const LOCAL_MEDIA_DIR = process.env.LOCAL_MEDIA_DIR
    ? path.resolve(process.env.LOCAL_MEDIA_DIR)
    : path.resolve(process.cwd(), "./.local-media");

const MAX_IMAGE_DIMENSION = 4096;
const WEBP_QUALITY = 82;
const CACHE_CONTROL = "public, max-age=31536000, immutable";
const MEDIA_ROUTE_PREFIX = process.env.MEDIA_ROUTE_PREFIX || "/media";

sharp.concurrency(2);

function normalizeTenantSlug(slug: string): string {
    return slug.trim().toLowerCase();
}

function assertValidTenantSlug(slug: string) {
    if (!/^[a-z0-9-]+$/.test(slug)) {
        throw new Error("Invalid tenant slug");
    }
}

function normalizeMediaPrefix(prefix: string): string {
    const trimmed = prefix.trim();
    const withLeading = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    return withLeading.endsWith("/") ? withLeading.slice(0, -1) : withLeading;
}

const MEDIA_PREFIX_NORMALIZED = normalizeMediaPrefix(MEDIA_ROUTE_PREFIX);

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

function isValidObjectKey(key: string): boolean {
    if (!key || key.startsWith("/")) return false;
    if (key.includes("\\")) return false;
    if (hasDotDotSegment(key)) return false;
    return /^[a-z0-9/_\-\.]+$/.test(key);
}

function extractObjectKey(raw: string): string | null {
    const trimmed = raw.trim();
    const decoded = decodeKey(trimmed) ?? trimmed;
    if (decoded.startsWith(`${MEDIA_PREFIX_NORMALIZED}/`)) {
        return decoded.slice(MEDIA_PREFIX_NORMALIZED.length + 1);
    }
    if (decoded.startsWith("t/")) {
        return decoded;
    }
    return null;
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
	const chunks: Buffer[] = [];
	for await (const chunk of stream) {
		if (Buffer.isBuffer(chunk)) {
			chunks.push(chunk);
			continue;
		}
		if (typeof chunk === "string") {
			// Safety: if a stream was put into string mode, default utf8 would corrupt binary data.
			// "latin1" preserves 0–255 byte values.
			chunks.push(Buffer.from(chunk, "latin1"));
			continue;
		}
		// Most Node streams yield Uint8Array here (Buffer is a Uint8Array subclass).
		chunks.push(Buffer.from(chunk as Uint8Array));
	}
	return Buffer.concat(chunks);
}

function looksLikeSupportedImage(buf: Buffer): boolean {
	if (buf.length < 12) return false;
	// PNG: 89 50 4E 47 0D 0A 1A 0A
	const isPng = buf
		.slice(0, 8)
		.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
	if (isPng) return true;
	// JPEG: FF D8 FF
	const isJpeg = buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
	if (isJpeg) return true;
	// WebP: "RIFF"...."WEBP"
	const isWebp =
		buf.slice(0, 4).toString("ascii") === "RIFF" &&
		buf.slice(8, 12).toString("ascii") === "WEBP";
	return isWebp;
}

async function ensureLocalMediaDirForKey(objectKey: string): Promise<string> {
    const filePath = path.resolve(LOCAL_MEDIA_DIR, objectKey);
    const base = path.resolve(LOCAL_MEDIA_DIR);
    if (filePath !== base && !filePath.startsWith(`${base}${path.sep}`)) {
        throw new Error("Invalid local media path");
    }

    const dir = path.dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
    return filePath;
}

export async function saveFile(
    fileInput: Readable | Buffer | Uint8Array,
    _originalFilename: string,
    tenantSlug: string
): Promise<{ objectKey: string; urlPath: string; etag?: string }> {
    const normalizedTenant = normalizeTenantSlug(tenantSlug);
    assertValidTenantSlug(normalizedTenant);

    const objectKey = `t/${normalizedTenant}/images/${randomUUID()}.webp`;
    const inputBuffer = Buffer.isBuffer(fileInput)
        ? fileInput
        : fileInput instanceof Uint8Array
          ? Buffer.from(fileInput)
          : await streamToBuffer(fileInput);
	if (inputBuffer.length === 0) {
		throw new Error("Empty upload stream");
	}
	if (!looksLikeSupportedImage(inputBuffer)) {
		const head = inputBuffer.subarray(0, 16).toString("hex");
		throw new Error(
			`Upload is not a supported image (size=${inputBuffer.length}, head=${head})`
		);
	}
	let outputBuffer: Buffer;
	try {
		outputBuffer = await sharp(inputBuffer, { limitInputPixels: MAX_IMAGE_DIMENSION * MAX_IMAGE_DIMENSION })
			.rotate()
			.resize({
				width: MAX_IMAGE_DIMENSION,
				height: MAX_IMAGE_DIMENSION,
				fit: "inside",
				withoutEnlargement: true
			})
			.webp({ quality: WEBP_QUALITY })
			.toBuffer();
	} catch (e) {
		// Debug-only: dump the raw input for inspection in local dev.
		// In production, we avoid leaking details and avoid disk writes.
		if (process.env.NODE_ENV !== "production" && !isR2Configured()) {
			try {
				const dumpKey = `_debug/uploads/${randomUUID()}.bin`;
				const dumpPath = await ensureLocalMediaDirForKey(dumpKey);
				await pipeline(Readable.from(inputBuffer), createWriteStream(dumpPath));
				logger.warn(
					{
						size: inputBuffer.length,
						head: inputBuffer.subarray(0, 16).toString("hex"),
						dumpPath,
						err: e instanceof Error ? e.message : String(e),
					},
					"Upload decode failed; dumped raw input"
				);
			} catch (dumpErr) {
				logger.warn(
					{ dumpErr: dumpErr instanceof Error ? dumpErr.message : String(dumpErr) },
					"Upload decode failed; dump also failed"
				);
			}
		}
		throw e;
	}

    let etag: string | undefined;
    if (isR2Configured()) {
        const res = await r2PutObject({
            key: objectKey,
            body: outputBuffer,
            contentType: "image/webp",
            cacheControl: CACHE_CONTROL,
            ifNoneMatch: "*"
        });
        etag = res.etag;
    } else {
        // Local dev fallback: write to disk and serve via BFF /media
        const filePath = await ensureLocalMediaDirForKey(objectKey);
        const stream = Readable.from(outputBuffer);
        await pipeline(stream, createWriteStream(filePath));
    }

    const prefix = normalizeMediaPrefix(MEDIA_ROUTE_PREFIX);
    return {
        objectKey,
        urlPath: `${prefix}/${objectKey}`,
        etag
    };
}

export async function deleteFile(relativeUrlOrKey: string) {
    const objectKey = extractObjectKey(relativeUrlOrKey);
    if (objectKey) {
        if (!isValidObjectKey(objectKey)) {
            logger.warn({ objectKey }, "Blocked delete: invalid object key");
            return;
        }
        try {
            if (isR2Configured()) {
                await r2DeleteObject(objectKey);
            } else {
                const filePath = await ensureLocalMediaDirForKey(objectKey);
                if (existsSync(filePath)) {
                    unlinkSync(filePath);
                }
            }
        } catch (e) {
            logger.error({ error: e, objectKey }, "Failed to delete media object");
        }
        return;
    }

    if (!relativeUrlOrKey.startsWith("/uploads/")) {
        return; // Safety: only delete files we own (legacy)
    }

    const filename = relativeUrlOrKey.replace("/uploads/", "");
    const filePath = join(UPLOADS_DIR, filename);
    const normalizedPath = normalize(filePath);
    const uploadsDir = normalize(UPLOADS_DIR);

    // Prevent directory traversal attacks
    const relativePath = relative(uploadsDir, normalizedPath);
    const isOutside = relativePath.startsWith('..') || join(uploadsDir, relativePath) !== normalizedPath;

    if (isOutside) {
        logger.warn({
            securityEvent: 'PATH_TRAVERSAL_ATTEMPT',
            filePath: filePath,
            uploadsDir: uploadsDir,
            normalizedPath: normalizedPath
        }, 'Blocked file deletion outside uploads directory');
        return;
    }

    if (existsSync(normalizedPath)) {
        try {
            unlinkSync(normalizedPath);
        } catch (e) {
            logger.error({
                error: e instanceof Error ? { message: e.message, stack: e.stack } : String(e),
                filePath: normalizedPath
            }, 'Failed to delete file');
        }
    }
}
