import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { tenantContextPlugin } from "../../plugins/tenant-context.js";
import { webhooksRoutes } from "../../domains/infra/webhooks.routes.js";
import { envSecretResolver } from "../../services/secrets.js";
import { rawBodyPlugin } from "../../plugins/raw-body.js";

describe("POST /webhooks/payments/:provider/:providerId (skeleton)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await rawBodyPlugin(app);
    await tenantContextPlugin(app);
    const prisma = {
      paymentProvider: {
        findFirst: async ({ where }: any) => {
          if (where?.id !== "provider123" || where?.type !== "MOLLIE") return null;
          return { id: "provider123", tenantId: "tenant1", type: "MOLLIE", config: { webhookTokens: ["token"] } };
        },
      },
      paymentEvent: {
        create: async () => ({ id: "evt1" }),
      },
    };
    await webhooksRoutes(app, { prisma: prisma as any, secrets: envSecretResolver() });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("does not require x-tenant-slug", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/mollie/provider123?t=token",
      payload: "id=tr_123",
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it("unknown provider returns 404", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/unknown/provider123?t=token",
      payload: "{}",
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(404);
  });
});
