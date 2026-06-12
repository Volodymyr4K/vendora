import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { tenantContextPlugin } from "../../plugins/tenant-context.js";
import { webhooksRoutes } from "../../domains/infra/webhooks.routes.js";
import { rawBodyPlugin } from "../../plugins/raw-body.js";

function liqpaySigSha1(privateKey: string, data: string) {
  return crypto.createHash("sha1").update(`${privateKey}${data}${privateKey}`).digest("base64");
}

function liqpaySigSha3(privateKey: string, data: string) {
  return crypto.createHash("sha3-256").update(`${privateKey}${data}${privateKey}`).digest("base64");
}

describe("POST /webhooks/payments/liqpay/:providerId (signature)", () => {
  let app: FastifyInstance;
  const create = { calls: 0 };
  let providerConfig: any;
  const secretsValues: Record<string, string> = {
    LIQPAY_PRIVATE_KEY: "priv",
    LIQPAY_PRIVATE_KEY_PREV: "prev",
  };

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await rawBodyPlugin(app);
    await tenantContextPlugin(app);

    providerConfig = {
      webhookTokens: ["token"],
      liqpay: { currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureInAlgorithms: ["sha1"] },
    };

    const prisma = {
      paymentProvider: {
        findFirst: async ({ where }: any) => {
          if (where?.id !== "provider123" || where?.type !== "LIQPAY") return null;
          return {
            id: "provider123",
            tenantId: "tenant1",
            type: "LIQPAY",
            config: providerConfig,
          };
        },
      },
      paymentEvent: {
        create: async () => {
          create.calls += 1;
          return { id: "evt1" };
        },
      },
    };

    const secrets = { resolve: (ref: string) => secretsValues[ref] };
    await webhooksRoutes(app, { prisma: prisma as any, secrets });
    await app.ready();
  });

  beforeEach(() => {
    create.calls = 0;
  });

  afterAll(async () => {
    await app.close();
  });

  it("accepts valid signature for form-encoded payload", async () => {
    providerConfig = {
      webhookTokens: ["token"],
      liqpay: { currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureInAlgorithms: ["sha1"] },
    };

    const payloadObj = { order_id: "tx-1" };
    const data = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");
    const signature = liqpaySigSha1("priv", data);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(create.calls).toBe(1);
  });

  it("rejects invalid signature with 401 and no inserts", async () => {
    providerConfig = {
      webhookTokens: ["token"],
      liqpay: { currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureInAlgorithms: ["sha1"] },
    };

    const payloadObj = { order_id: "tx-1" };
    const data = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");
    const signature = "bad";

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(res.statusCode).toBe(401);
    expect(create.calls).toBe(0);
  });

  it("rejects invalid token with 404 before signature verification (anti-enumeration)", async () => {
    providerConfig = {
      webhookTokens: ["token"],
      liqpay: { currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureInAlgorithms: ["sha1"] },
    };

    const payloadObj = { order_id: "tx-1" };
    const data = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");
    const signature = "bad";

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=wrong",
      payload: new URLSearchParams({ data, signature }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(res.statusCode).toBe(404);
    expect(create.calls).toBe(0);
  });

  it("accepts signature using previous secret when previousValidUntil is in the future", async () => {
    providerConfig = {
      webhookTokens: ["token"],
      liqpay: {
        currentSecretRef: "LIQPAY_PRIVATE_KEY",
        previousSecretRef: "LIQPAY_PRIVATE_KEY_PREV",
        previousValidUntil: "2099-01-01T00:00:00.000Z",
        signatureInAlgorithms: ["sha1"],
      },
    };

    const payloadObj = { order_id: "tx-prev" };
    const data = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");
    const signature = liqpaySigSha1("prev", data);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(create.calls).toBe(1);
  });

  it("rejects signature using previous secret when previousValidUntil is expired", async () => {
    providerConfig = {
      webhookTokens: ["token"],
      liqpay: {
        currentSecretRef: "LIQPAY_PRIVATE_KEY",
        previousSecretRef: "LIQPAY_PRIVATE_KEY_PREV",
        previousValidUntil: "2000-01-01T00:00:00.000Z",
        signatureInAlgorithms: ["sha1"],
      },
    };

    const payloadObj = { order_id: "tx-prev-expired" };
    const data = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");
    const signature = liqpaySigSha1("prev", data);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(res.statusCode).toBe(401);
    expect(create.calls).toBe(0);
  });

  it("accepts only algorithms listed in signatureInAlgorithms (sha3-only)", async () => {
    providerConfig = {
      webhookTokens: ["token"],
      liqpay: { currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureInAlgorithms: ["sha3-256"] },
    };

    const payloadObj = { order_id: "tx-sha3" };
    const data = Buffer.from(JSON.stringify(payloadObj), "utf8").toString("base64");

    const resSha1 = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature: liqpaySigSha1("priv", data) }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(resSha1.statusCode).toBe(401);
    expect(create.calls).toBe(0);

    const resSha3 = await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature: liqpaySigSha3("priv", data) }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });
    expect(resSha3.statusCode).toBe(200);
    expect(create.calls).toBe(1);
  });
});
