import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { tenantContextPlugin } from "../../plugins/tenant-context.js";
import { rawBodyPlugin } from "../../plugins/raw-body.js";
import { webhooksRoutes } from "../../domains/infra/webhooks.routes.js";
import { metricsRoutes } from "../../domains/infra/metrics.routes.js";
import { register } from "../../lib/metrics.js";

function liqpaySigSha1(privateKey: string, data: string) {
  return crypto.createHash("sha1").update(`${privateKey}${data}${privateKey}`).digest("base64");
}

describe("payments webhook metrics", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    register.resetMetrics();

    app = Fastify({ logger: false });
    await rawBodyPlugin(app);
    await tenantContextPlugin(app);

    const prisma = {
      paymentProvider: {
        findFirst: async ({ where }: any) => {
          if (where?.id !== "provider123" || where?.type !== "LIQPAY") return null;
          return {
            id: "provider123",
            tenantId: "tenant1",
            type: "LIQPAY",
            config: {
              webhookTokens: ["token"],
              liqpay: { currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureInAlgorithms: ["sha1"] },
            },
          };
        },
      },
      paymentEvent: {
        create: async () => ({ id: "evt1" }),
      },
    };

    const secrets = { resolve: (ref: string) => (ref === "LIQPAY_PRIVATE_KEY" ? "priv" : undefined) };
    await webhooksRoutes(app, { prisma: prisma as any, secrets });
    await metricsRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("tracks invalid_token / invalid_signature / no_external_id outcomes", async () => {
    // unknown provider
    await app.inject({
      method: "POST",
      url: "/webhooks/payments/unknown/provider123?t=token",
      payload: "{}",
      headers: { "content-type": "application/json" },
    });

    // provider not found
    await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider404?t=token",
      payload: new URLSearchParams({ data: "ZGF0YQ==", signature: "bad" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    // invalid token
    await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=wrong",
      payload: new URLSearchParams({ data: "ZGF0YQ==", signature: "bad" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    // invalid signature
    await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data: "ZGF0YQ==", signature: "bad" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    // valid signature but cannot extract externalId → 2xx no-op
    const data = Buffer.from(JSON.stringify({}), "utf8").toString("base64");
    const signature = liqpaySigSha1("priv", data);
    await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data, signature }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    // inserted
    const dataOk = Buffer.from(JSON.stringify({ order_id: "tx_1" }), "utf8").toString("base64");
    const signatureOk = liqpaySigSha1("priv", dataOk);
    await app.inject({
      method: "POST",
      url: "/webhooks/payments/liqpay/provider123?t=token",
      payload: new URLSearchParams({ data: dataOk, signature: signatureOk }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    const res = await app.inject({ method: "GET", url: "/metrics" });
    expect(res.statusCode).toBe(200);
    const body = res.body;

    expect(body).toContain('payments_webhook_requests_total{provider="unknown",outcome="unknown_provider"} 1');
    expect(body).toContain('payments_webhook_requests_total{provider="liqpay",outcome="provider_not_found"} 1');
    expect(body).toContain('payments_webhook_requests_total{provider="liqpay",outcome="invalid_token"} 1');
    expect(body).toContain('payments_webhook_requests_total{provider="liqpay",outcome="invalid_signature"} 1');
    expect(body).toContain('payments_webhook_requests_total{provider="liqpay",outcome="no_external_id"} 1');
    expect(body).toContain('payments_webhook_requests_total{provider="liqpay",outcome="inserted"} 1');
  });
});
