import type { FastifyInstance } from "fastify";
import { saveFile } from "../../../utils/fileStorage.js";
import { authPlugin } from "../../../plugins/auth.js";

export async function routesUpload(app: FastifyInstance) {
    // Enforce Authentication
    await app.register(authPlugin);

    const handler = async (req: any, reply: any) => {
        const data = await req.file();

        if (!data) {
            return reply.code(400).send({ error: "No file uploaded" });
        }

        // Safety: Validate mimetype
        const allowedTypes = ["image/jpeg", "image/png", "image/webp"];
        if (!allowedTypes.includes(data.mimetype)) {
            return reply.code(400).send({ error: "Invalid file type. Only JPG, PNG, and WebP are allowed." });
        }

        // Limit file size (handled partially by busboy/multipart limits, but good to check)
        // Note: data.file is a stream. We can't check size easily without reading.
        // Fastify multipart limits will handle maxFileSize.

        try {
            const tenantSlug = req.tenant?.slug;
            if (!tenantSlug) {
                return reply.code(400).send({ error: "Tenant context required" });
            }

            // Use multipart helper to avoid stream encoding issues across Node/undici versions.
            const buf = await data.toBuffer();
            const result = await saveFile(buf, data.filename, tenantSlug);
            return {
                url: result.urlPath,
                urlPath: result.urlPath,
                objectKey: result.objectKey
            };
        } catch (e) {
            req.log.error(e, "Upload failed");
            if (process.env.NODE_ENV !== "production") {
                const details = e instanceof Error ? e.message : String(e);
                return reply.code(500).send({ error: "File upload failed", details });
            }
            return reply.code(500).send({ error: "File upload failed" });
        }
    };

    // Canonical (preferred): registered under tenantScope prefix "/admin" => POST /admin/upload
    app.post("/upload", {}, handler);
    // Backward-compatible alias: historically this was "/admin/upload" under tenantScope => POST /admin/admin/upload
    app.post("/admin/upload", {}, handler);
}
