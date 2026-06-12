import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

vi.mock("../../services/payments/resync-transaction.js", async () => {
  const actual = await vi.importActual<any>("../../services/payments/resync-transaction.js");
  return { ...actual, resyncPaymentTransaction: vi.fn() };
});

vi.mock("../../services/payments/resync-external.js", async () => {
  const actual = await vi.importActual<any>("../../services/payments/resync-external.js");
  return { ...actual, resyncExternalPayment: vi.fn() };
});

import Fastify, { type FastifyInstance } from "fastify";
import { routesInternalPayments } from "../../domains/internal/internal-payments.routes.js";
import { resyncPaymentTransaction } from "../../services/payments/resync-transaction.js";
import { resyncExternalPayment } from "../../services/payments/resync-external.js";

const INTERNAL_SECRET = "x".repeat(40);
const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const TX_ID = "22222222-2222-4222-8222-222222222222";
const PROVIDER_ID = "33333333-3333-4333-8333-333333333333";

describe("Internal payments operational API", () => {
  let app: FastifyInstance;
  let prisma: any;
  let paymentsQueue: any;

  beforeAll(async () => {
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    delete process.env.PAYMENTS_INTERNAL_SYNC_ENABLED;

    app = Fastify({ logger: false });

    prisma = {
      paymentTransaction: {
        findUnique: async ({ where }: any) => {
          if (where?.id !== TX_ID) return null;
          return { id: TX_ID, tenantId: TENANT_ID };
        },
      },
      paymentProvider: {
        findUnique: async ({ where }: any) => {
          if (where?.id !== PROVIDER_ID) return null;
          return { id: PROVIDER_ID, tenantId: TENANT_ID };
        },
      },
    };

    paymentsQueue = {
      enqueueResyncTransaction: async ({ tenantId, transactionId }: any) => ({ jobId: `job:tx:${tenantId}:${transactionId}` }),
      enqueueResyncExternal: async ({ tenantId, providerId, externalId }: any) => ({ jobId: `job:ext:${tenantId}:${providerId}:${externalId}` }),
    };

    await routesInternalPayments(app, { prisma: prisma as any, paymentsQueue: paymentsQueue as any, secrets: { resolve: () => undefined } as any });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("403 without x-internal-secret", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/payments/resync",
      payload: { transactionId: TX_ID },
      headers: { "content-type": "application/json" },
    });
    expect(res.statusCode).toBe(403);
  });

  it("202 enqueues resync.transaction", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/payments/resync",
      payload: { transactionId: TX_ID },
      headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ queued: true, jobId: `job:tx:${TENANT_ID}:${TX_ID}` });
  });

  it("404 when transaction missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/payments/resync",
      payload: { transactionId: "99999999-9999-4999-8999-999999999999" },
      headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    });
    expect(res.statusCode).toBe(404);
  });

  it("202 enqueues resync.external", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/payments/resync/external",
      payload: { providerId: PROVIDER_ID, externalId: "inv-1" },
      headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    });
    expect(res.statusCode).toBe(202);
    expect(res.json()).toEqual({ queued: true, jobId: `job:ext:${TENANT_ID}:${PROVIDER_ID}:inv-1` });
  });
});

describe("Internal payments operational API (sync fallback)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;
    process.env.PAYMENTS_INTERNAL_SYNC_ENABLED = "true";

    (resyncPaymentTransaction as any).mockResolvedValue({ ok: true, didUpdate: false, code: "NOOP" });
    (resyncExternalPayment as any).mockResolvedValue({ ok: false, code: "PROVIDER_AUTH_FAILED" });

    app = Fastify({ logger: false });

    const prismaNoQueue = {
      paymentTransaction: {
        findUnique: async ({ where }: any) => {
          if (where?.id !== TX_ID) return null;
          return { id: TX_ID, tenantId: TENANT_ID };
        },
      },
      paymentProvider: {
        findUnique: async ({ where }: any) => {
          if (where?.id !== PROVIDER_ID) return null;
          return { id: PROVIDER_ID, tenantId: TENANT_ID };
        },
      },
    };

    await routesInternalPayments(app, { prisma: prismaNoQueue as any, paymentsQueue: undefined, secrets: { resolve: () => undefined } as any });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    delete process.env.PAYMENTS_INTERNAL_SYNC_ENABLED;
  });

  it("200 runs sync resync.transaction when queue disabled", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/payments/resync",
      payload: { transactionId: TX_ID },
      headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ queued: false, mode: "sync", result: { ok: true, code: "NOOP" } });
  });

  it("200 runs sync resync.external when queue disabled", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/internal/payments/resync/external",
      payload: { providerId: PROVIDER_ID, externalId: "inv-1" },
      headers: { "content-type": "application/json", "x-internal-secret": INTERNAL_SECRET },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ queued: false, mode: "sync", result: { ok: false, code: "PROVIDER_AUTH_FAILED" } });
  });
});
