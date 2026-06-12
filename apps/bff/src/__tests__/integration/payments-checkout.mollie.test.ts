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

describe("POST /payments/checkout (mollie)", () => {
  let app: FastifyInstance;
  const fetchMock = vi.fn();

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

    vi.stubGlobal("fetch", fetchMock);

    const prismaTx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "order-db-1", total: 1000, currency: "UAH", branchSlug: "main" }]),
      paymentTransaction: {
        findFirst: vi.fn().mockResolvedValue(null),
        findUnique: vi.fn().mockResolvedValue({ id: TX_ID, checkoutUrl: null, status: "INITIATED", providerId: "prov-mollie", externalId: null }),
        create: vi.fn().mockResolvedValue({ id: TX_ID, checkoutUrl: null, status: "INITIATED", providerId: "prov-mollie", externalId: null }),
        delete: vi.fn().mockResolvedValue({}),
      },
      paymentCheckoutRequest: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "pcr-1" }),
      },
    };

    const prisma = {
      paymentProvider: {
        findMany: vi.fn().mockResolvedValue([
          { id: "prov-mollie", tenantId: TENANT_ID, type: "MOLLIE", mode: "TEST", status: "ACTIVE", credentialsRef: "MOLLIE_KEY", config: { webhookTokens: ["tok"] } },
        ]),
        findUnique: vi.fn().mockResolvedValue({ id: "prov-mollie", type: "MOLLIE", credentialsRef: "MOLLIE_KEY", config: { webhookTokens: ["tok"] } }),
        findFirst: vi.fn(),
      },
      paymentTransaction: {
        findUnique: vi.fn().mockImplementation(async ({ select }: any) => {
          if (select?.amountMinor) {
            return {
              id: TX_ID,
              orderDbId: "order-db-1",
              checkoutUrl: null,
              status: "INITIATED",
              providerId: "prov-mollie",
              externalId: null,
              amountMinor: 1000,
              currency: "UAH",
              currencyExponent: 2,
            };
          }
          return { id: TX_ID, checkoutUrl: "https://pay.mollie.test/checkout", status: "PENDING" };
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      paymentCheckoutRequest: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (fn: any) => fn(prismaTx)),
    } as any;

    process.env.WEB_BASE_URL = "http://localhost:3000";
    process.env.MOLLIE_KEY = "test_x";

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () =>
        JSON.stringify({
          id: "tr_1",
          _links: { checkout: { href: "https://pay.mollie.test/checkout" } },
        }),
    });

    await routesPayments(app, { prisma, config: { PAYMENTS_MODE: "TEST" } });
    await app.ready();
  });

  afterAll(async () => {
    vi.unstubAllGlobals();
    await app.close();
  });

  it("200 when mollie payment is created and persisted", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/payments/checkout",
      headers: { "x-tenant-slug": TENANT_SLUG, "content-type": "application/json", "idempotency-key": "idem-1" },
      payload: { orderToken: "ot-1" },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { transactionId: string; checkoutUrl: string; status: string };
    expect(body.transactionId).toBe(TX_ID);
    expect(body.status).toBe("PENDING");
    expect(body.checkoutUrl).toBe("https://pay.mollie.test/checkout");
    expect(fetchMock).toHaveBeenCalled();
  });
});

