import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routesPayments } from "../../domains/storefront/payments.routes.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const TENANT_SLUG = "test-tenant";
const TX_ID = "22222222-2222-4222-8222-222222222222";

const tenant = {
  id: TENANT_ID,
  name: "Test Tenant",
  slug: TENANT_SLUG,
  isActive: true,
  customDomainsEnabled: false,
  features: { version: 1, modules: {} },
  theme: { version: 1, componentSet: "default", colors: {}, radii: {}, spacing: {}, typography: {} },
  mainTemplate: "default",
};

describe("POST /payments/checkout", () => {
  let app: FastifyInstance;
  let prismaTx: any;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.addHook("onRequest", async (req) => {
      const slug = req.headers["x-tenant-slug"] as string | undefined;
      if (slug === TENANT_SLUG) {
        (req as { tenant?: typeof tenant }).tenant = tenant;
      }
    });

    prismaTx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "order-db-1", total: 1234, currency: "UAH", branchSlug: "main" }]),
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ id: TX_ID, checkoutUrl: null, status: "INITIATED", providerId: "prov-1", externalId: null }),
        create: vi.fn().mockResolvedValue({ id: TX_ID, checkoutUrl: null, status: "INITIATED", providerId: "prov-1", externalId: null }),
        delete: vi.fn().mockResolvedValue({}),
      },
      paymentCheckoutRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pcr-1" }),
      },
    };

    const checkoutUrl = "http://localhost:3000/checkout/liqpay?data=ZGF0YQ==&signature=c2ln";

    const prisma = {
      paymentProvider: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "prov-1",
            tenantId: TENANT_ID,
            type: "LIQPAY",
            mode: "TEST",
            status: "ACTIVE",
            credentialsRef: null,
            config: {
              webhookTokens: ["tok"],
              liqpay: { publicKey: "pub", currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureOutAlgorithm: "sha1", version: 3 },
            },
          },
        ]),
        findFirst: vi.fn(),
        findUnique: vi.fn().mockResolvedValue({
          id: "prov-1",
          type: "LIQPAY",
          config: {
            webhookTokens: ["tok"],
            liqpay: { publicKey: "pub", currentSecretRef: "LIQPAY_PRIVATE_KEY", signatureOutAlgorithm: "sha1", version: 3 },
          },
        }),
      },
      paymentTransaction: {
        findUnique: vi.fn().mockImplementation(async ({ select }: any) => {
          if (select?.amountMinor) {
            return {
              id: TX_ID,
              checkoutUrl: null,
              status: "INITIATED",
              providerId: "prov-1",
              externalId: null,
              amountMinor: 1234,
              currency: "UAH",
              currencyExponent: 2,
            };
          }
          return {
            id: TX_ID,
            checkoutUrl,
            status: "PENDING",
          };
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentCheckoutRequest: {
        findUnique: vi.fn().mockImplementation(async ({ where }: any) => {
          const key = where?.tenantId_scope_idempotencyKey?.idempotencyKey;
          if (key === "idem-conflict") {
            return { requestHash: "different-hash", transactionId: TX_ID };
          }
          return null;
        }),
      },
      $transaction: vi.fn(async (fn: any) => fn(prismaTx)),
    } as any;

    process.env.WEB_BASE_URL = "http://localhost:3000";
    process.env.LIQPAY_PRIVATE_KEY = "priv";

    await routesPayments(app, { prisma, config: { PAYMENTS_MODE: "TEST" } });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  it("400 when Idempotency-Key missing", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      headers: { "x-tenant-slug": TENANT_SLUG, "content-type": "application/json" },
      payload: { orderToken: "ot-1" },
    });
    expect(res.statusCode).toBe(400);
  });

  it("200 when LiqPay checkoutUrl is built and persisted", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      headers: {
        "x-tenant-slug": TENANT_SLUG,
        "content-type": "application/json",
        "idempotency-key": "idem-1",
      },
      payload: { orderToken: "ot-1" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { transactionId: string; checkoutUrl: string; status: string };
    expect(body.transactionId).toBe(TX_ID);
    expect(body.status).toBe("PENDING");
    expect(body.checkoutUrl).toContain("/checkout/liqpay?data=");
  });

  it("409 when Idempotency-Key exists but request hash differs", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      headers: {
        "x-tenant-slug": TENANT_SLUG,
        "content-type": "application/json",
        "idempotency-key": "idem-conflict",
      },
      payload: { orderToken: "ot-1", providerId: "prov-2" },
    });

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: "IDEMPOTENCY_CONFLICT" });
  });

  it("422 when currency exponent is not 2 (MVP guardrail)", async () => {
    // JPY exponent = 0 → must be rejected to avoid amount mismatch.
    prismaTx.$queryRaw.mockResolvedValueOnce([{ id: "order-db-1", total: 1234, currency: "JPY", branchSlug: "main" }]);

    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      headers: {
        "x-tenant-slug": TENANT_SLUG,
        "content-type": "application/json",
        "idempotency-key": "idem-jpy",
      },
      payload: { orderToken: "ot-jpy" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_UNSUPPORTED_CURRENCY_EXPONENT" });
  });
});
