import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routesPayments } from "../../domains/storefront/payments.routes.js";

describe("POST /payments/checkout (provider selection)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook("onRequest", async (req) => {
      // Minimal tenant context for validateTenant()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any).tenant = { id: "tenant1", slug: "t1", isActive: true, name: "Tenant 1", customDomainsEnabled: false };
    });

    const prisma = {
      paymentCheckoutRequest: {
        findUnique: async () => null,
      },
      paymentProvider: {
        findMany: async () => [],
        findFirst: async () => ({ id: "prov1", tenantId: "tenant1", type: "MOLLIE", mode: "TEST", status: "DISABLED", credentialsRef: null, config: { webhookTokens: ["t".repeat(40)] } }),
      },
    };

    await routesPayments(app, { prisma: prisma as any, config: { PAYMENTS_MODE: "TEST" } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("requires Idempotency-Key header", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      payload: { orderToken: "order-token" },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: "MISSING_IDEMPOTENCY_KEY" });
  });

  it("returns 422 when no ACTIVE providers exist for mode", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      payload: { orderToken: "order-token" },
      headers: { "content-type": "application/json", "idempotency-key": "k1" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_NO_ACTIVE_PROVIDER" });
  });

  it("returns 422 when providerId is DISABLED", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      payload: { orderToken: "order-token", providerId: "prov1" },
      headers: { "content-type": "application/json", "idempotency-key": "k2" },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_INVALID" });
  });
});
