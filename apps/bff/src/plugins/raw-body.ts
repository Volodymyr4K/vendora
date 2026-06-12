/**
 * Raw Body Plugin
 *
 * Captures exact request body bytes for specific routes (e.g. webhooks) so
 * signature verification can be performed on raw bytes.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { Readable } from "node:stream";

type RawBodyRouteConfig = {
  rawBody?: boolean;
  rawBodyMaxBytes?: number;
};

export async function rawBodyPlugin(app: FastifyInstance) {
  // Ensure webhook-like endpoints can accept common content types without 415.
  // We intentionally parse as Buffer so handlers can rely on `req.rawBody` as bytes.
  app.addContentTypeParser(
    "application/x-www-form-urlencoded",
    { parseAs: "buffer" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (_req: any, body: Buffer, done: (err: Error | null, res?: unknown) => void) => {
      done(null, body);
    }
  );

  app.addHook("preParsing", async (req: FastifyRequest, _reply: FastifyReply, payload) => {
    const config = (req.routeOptions?.config ?? {}) as RawBodyRouteConfig;
    if (!config.rawBody) return payload;

    const maxBytes = config.rawBodyMaxBytes ?? 1024 * 1024;
    if (!payload) {
      req.rawBody = Buffer.alloc(0);
      return payload;
    }

    const chunks: Buffer[] = [];
    let totalBytes = 0;

    for await (const chunk of payload) {
      const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      totalBytes += buf.length;

      if (totalBytes > maxBytes) {
        const err = new Error("Request body too large");
        // Fastify error handler reads statusCode when present.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (err as any).statusCode = 413;
        throw err;
      }

      chunks.push(buf);
    }

    const raw = Buffer.concat(chunks);
    req.rawBody = raw;
    return Readable.from(raw);
  });
}
