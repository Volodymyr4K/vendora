import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { tenantContextPlugin } from "../../plugins/tenant-context.js";
import { rawBodyPlugin } from "../../plugins/raw-body.js";
import { webhooksRoutes } from "../../domains/infra/webhooks.routes.js";
import { metricsRoutes } from "../../domains/infra/metrics.routes.js";
import { register } from "../../lib/metrics.js";

describe("payments webhook dedup (P2002)", () => {
  let app: FastifyInstance;
  const enqueueResyncExternal = vi.fn(async () => ({ jobId: "job1" }));
  const enqueueWebhookProcess = vi.fn(async () => ({ jobId: "job2" }));

  beforeAll(async () => {
    register.resetMetrics();

    app = Fastify({ logger: false });
    await rawBodyPlugin(app);
    await tenantContextPlugin(app);

    const prisma = {
      paymentProvider: {
        findFirst: async ({ where }: any) => {
          if (where?.id !== "provider123" || where?.type !== "MOLLIE") return null;
          return {
            id: "provider123",
            tenantId: "tenant1",
            type: "MOLLIE",
            credentialsRef: "MOLLIE_KEY",
            config: { webhookTokens: ["token"] },
          };
        },
      },
      paymentEvent: {
        create: async () => {
          const err: any = new Error("unique");
          err.code = "P2002";
          throw err;
        },
      },
    };

    const secrets = { resolve: () => undefined };
    await webhooksRoutes(app, {
      prisma: prisma as any,
      secrets: secrets as any,
      paymentsQueue: { enqueueResyncExternal, enqueueWebhookProcess } as any,
    });
    await metricsRoutes(app);
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns 200 and enqueues resync.external on dedup hit (no webhook.process)", async () => {
    enqueueResyncExternal.mockClear();
    enqueueWebhookProcess.mockClear();

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/mollie/provider123?t=token",
      payload: new URLSearchParams({ id: "tr_123" }).toString(),
      headers: { "content-type": "application/x-www-form-urlencoded" },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });

    expect(enqueueResyncExternal).toHaveBeenCalledTimes(1);
    expect(enqueueResyncExternal).toHaveBeenCalledWith({ tenantId: "tenant1", providerId: "provider123", externalId: "tr_123" });
    expect(enqueueWebhookProcess).toHaveBeenCalledTimes(0);

    const metricsRes = await app.inject({ method: "GET", url: "/metrics" });
    expect(metricsRes.statusCode).toBe(200);
    expect(metricsRes.body).toContain('payments_webhook_requests_total{provider="mollie",outcome="dedup_hit"} 1');
  });
});
