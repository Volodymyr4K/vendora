import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { tenantContextPlugin } from "../../plugins/tenant-context.js";
import { rawBodyPlugin } from "../../plugins/raw-body.js";
import { webhooksRoutes } from "../../domains/infra/webhooks.routes.js";
import { envSecretResolver } from "../../services/secrets.js";

describe("rawBody capture for /webhooks/*", () => {
  let app: FastifyInstance;
  let seenRaw: Buffer | undefined;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await rawBodyPlugin(app);
    await tenantContextPlugin(app);
    app.addHook("preHandler", async (req) => {
      if (req.url.startsWith("/webhooks/")) {
        seenRaw = req.rawBody;
      }
    });
    const prisma = {
      paymentProvider: {
        findFirst: async () => ({ id: "provider123", tenantId: "tenant1", type: "MOLLIE", config: { webhookTokens: ["token"] } }),
      },
      paymentEvent: { create: async () => ({ id: "evt1" }) },
    };
    await webhooksRoutes(app, { prisma: prisma as any, secrets: envSecretResolver() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("captures exact raw bytes (including whitespace)", async () => {
    const payload = "{\n  \"a\": 1\n}\n";
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/mollie/provider123?t=token",
      payload,
      headers: { "content-type": "application/json" },
    });

    expect(res.statusCode).toBe(200);
    expect(seenRaw).toBeDefined();
    expect(seenRaw!.toString("utf8")).toBe(payload);
  });
});
