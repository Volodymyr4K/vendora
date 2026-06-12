import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import fjwt from "@fastify/jwt";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { authPlugin } from "../../plugins/auth.js";
import { routesSuperPaymentProviders } from "../../domains/super-admin/payment-providers.routes.js";

const TENANT_ID = "11111111-1111-4111-8111-111111111111";
const PROVIDER_ID = "22222222-2222-4222-8222-222222222222";
const WEBHOOK_TOKEN = "t".repeat(40);

describe("Super-admin payment providers routes", () => {
  let app: FastifyInstance;
  let prisma: any;

  beforeAll(async () => {
    app = Fastify({ logger: false });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    await app.register(fjwt, { secret: "test-secret-super-payment-providers" });

    prisma = {
      tenant: {
        findUnique: vi.fn().mockResolvedValue({ id: TENANT_ID }),
      },
      paymentProvider: {
        findMany: vi.fn().mockResolvedValue([]),
        create: vi.fn().mockResolvedValue({
          id: PROVIDER_ID,
          tenantId: TENANT_ID,
          type: "LIQPAY",
          mode: "TEST",
          status: "ACTIVE",
          credentialsRef: null,
          config: {
            webhookTokens: [WEBHOOK_TOKEN],
            liqpay: {
              publicKey: "pub",
              currentSecretRef: "LIQPAY_PRIVATE_KEY",
              signatureInAlgorithms: ["sha1"],
              signatureOutAlgorithm: "sha1",
              version: 3,
            },
          },
          createdAt: new Date("2026-02-24T00:00:00.000Z"),
          updatedAt: new Date("2026-02-24T00:00:00.000Z"),
        }),
        findFirst: vi.fn().mockResolvedValue({ id: PROVIDER_ID, type: "LIQPAY", credentialsRef: null, status: "ACTIVE", config: { webhookTokens: [WEBHOOK_TOKEN] } }),
        update: vi.fn().mockResolvedValue({
          id: PROVIDER_ID,
          tenantId: TENANT_ID,
          type: "LIQPAY",
          mode: "TEST",
          status: "DISABLED",
          credentialsRef: null,
          config: null,
          createdAt: new Date("2026-02-24T00:00:00.000Z"),
          updatedAt: new Date("2026-02-24T00:00:00.000Z"),
        }),
      },
    };

    await app.register(async (superScope) => {
      await superScope.register(authPlugin, { role: "super-admin" });
      await routesSuperPaymentProviders(superScope, { prisma });
    }, { prefix: "/super/tenants" });

    await app.ready();
  });

  beforeEach(() => {
    prisma.tenant.findUnique.mockClear();
    prisma.paymentProvider.findMany.mockClear();
    prisma.paymentProvider.create.mockClear();
    prisma.paymentProvider.findFirst.mockClear();
    prisma.paymentProvider.update.mockClear();
  });

  afterAll(async () => {
    await app.close();
  });

  async function superToken() {
    return app.jwt.sign({ userId: "super-1", role: "SUPER_ADMIN" });
  }

  it("401 when missing auth token", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json()).toMatchObject({ statusCode: 401 });
  });

  it("GET returns items list", async () => {
    const token = await superToken();
    prisma.paymentProvider.findMany.mockResolvedValueOnce([
      { id: PROVIDER_ID, tenantId: TENANT_ID, type: "LIQPAY", mode: "TEST", status: "ACTIVE", credentialsRef: null, config: { webhookTokens: [WEBHOOK_TOKEN] } },
    ]);
    const res = await app.inject({
      method: "GET",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}` },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      items: [
        { id: PROVIDER_ID, tenantId: TENANT_ID, type: "LIQPAY", mode: "TEST", status: "ACTIVE", credentialsRef: null, config: { webhookTokens: [WEBHOOK_TOKEN] } },
      ],
    });
  });

  it("POST validates config: webhookTokens must be url-safe and long enough", async () => {
    const token = await superToken();
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        config: {
          webhookTokens: ["short"],
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_INVALID" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST /webhook-token/rotate drops invalid legacy webhookTokens", async () => {
    const token = await superToken();
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      config: { webhookTokens: ["xyz"] }, // legacy too-short token
    } as any);

    prisma.paymentProvider.update.mockImplementationOnce(async (args: any) => ({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      type: "LIQPAY",
      mode: "TEST",
      status: "ACTIVE",
      credentialsRef: null,
      config: args.data.config,
      updatedAt: new Date().toISOString(),
    }));

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}/webhook-token/rotate`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { keepPrevious: true },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(typeof body.newToken).toBe("string");
    expect(body.provider?.config?.webhookTokens?.length).toBe(1);
    expect(body.provider?.config?.webhookTokens?.[0]).toBe(body.newToken);
  });

  it("POST validates config: webhookTokens required", async () => {
    const token = await superToken();
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        config: {
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_MISSING" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST rejects storing secrets in DB (LIQPAY privateKey)", async () => {
    const token = await superToken();
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            privateKey: "leak",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MUST_NOT_BE_IN_DB" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST creates payment provider when valid", async () => {
    const token = await superToken();
    process.env.LIQPAY_PRIVATE_KEY = "priv";
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });
    delete process.env.LIQPAY_PRIVATE_KEY;
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: PROVIDER_ID, tenantId: TENANT_ID, type: "LIQPAY", mode: "TEST" });
    expect(prisma.paymentProvider.create).toHaveBeenCalled();
  });

  it("POST liqpay ACTIVE requires secret present in env", async () => {
    const token = await superToken();
    delete process.env.LIQPAY_PRIVATE_KEY;
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST liqpay ACTIVE with previousSecretRef requires previous secret if not expired", async () => {
    const token = await superToken();
    process.env.LIQPAY_PRIVATE_KEY = "priv";
    delete process.env.LIQPAY_PRIVATE_KEY_PREV;
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            previousSecretRef: "LIQPAY_PRIVATE_KEY_PREV",
            previousValidUntil: "2099-01-01T00:00:00.000Z",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });

    delete process.env.LIQPAY_PRIVATE_KEY;
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST liqpay ACTIVE with expired previousValidUntil does not require previous secret", async () => {
    const token = await superToken();
    process.env.LIQPAY_PRIVATE_KEY = "priv";
    delete process.env.LIQPAY_PRIVATE_KEY_PREV;
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            previousSecretRef: "LIQPAY_PRIVATE_KEY_PREV",
            previousValidUntil: "2000-01-01T00:00:00.000Z",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });

    delete process.env.LIQPAY_PRIVATE_KEY;
    expect(res.statusCode).toBe(201);
    expect(prisma.paymentProvider.create).toHaveBeenCalled();
  });

  it("POST liqpay rejects invalid previousValidUntil", async () => {
    const token = await superToken();
    process.env.LIQPAY_PRIVATE_KEY = "priv";
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            currentSecretRef: "LIQPAY_PRIVATE_KEY",
            previousSecretRef: "LIQPAY_PRIVATE_KEY_PREV",
            previousValidUntil: "not-a-date",
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });

    delete process.env.LIQPAY_PRIVATE_KEY;
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_LIQPAY_PREVIOUS_VALID_UNTIL_INVALID" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST monobank ACTIVE requires pubkey", async () => {
    const token = await superToken();
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MONOBANK",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: "MONO_TOKEN",
        config: { webhookTokens: [WEBHOOK_TOKEN], monobank: {} },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_MONOBANK_PUBLIC_KEYS_REQUIRED_FOR_ACTIVE" });
  });

  it("POST monobank ACTIVE requires secret present in env", async () => {
    const token = await superToken();
    prisma.paymentProvider.create.mockClear();
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MONOBANK",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: "MONO_TOKEN_MISSING",
        config: { webhookTokens: [WEBHOOK_TOKEN], monobank: { webhookPublicKeysPem: ["pem"] } },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST monobank DISABLED allows missing pubkey (refresh later)", async () => {
    const token = await superToken();
    prisma.paymentProvider.create.mockResolvedValueOnce({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      type: "MONOBANK",
      mode: "TEST",
      status: "DISABLED",
      credentialsRef: "MONO_TOKEN",
      config: { webhookTokens: [WEBHOOK_TOKEN], monobank: {} },
      createdAt: new Date("2026-02-24T00:00:00.000Z"),
      updatedAt: new Date("2026-02-24T00:00:00.000Z"),
    });
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MONOBANK",
        mode: "TEST",
        status: "DISABLED",
        credentialsRef: "MONO_TOKEN",
        config: { webhookTokens: [WEBHOOK_TOKEN], monobank: {} },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: PROVIDER_ID, type: "MONOBANK", status: "DISABLED" });
  });

  it("POST monobank defaults to DISABLED when status omitted", async () => {
    const token = await superToken();
    prisma.paymentProvider.create.mockResolvedValueOnce({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      type: "MONOBANK",
      mode: "TEST",
      status: "DISABLED",
      credentialsRef: "MONO_TOKEN",
      config: { webhookTokens: [WEBHOOK_TOKEN], monobank: {} },
      createdAt: new Date("2026-02-24T00:00:00.000Z"),
      updatedAt: new Date("2026-02-24T00:00:00.000Z"),
    });
    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MONOBANK",
        mode: "TEST",
        credentialsRef: "MONO_TOKEN",
        config: { webhookTokens: [WEBHOOK_TOKEN], monobank: {} },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ id: PROVIDER_ID, type: "MONOBANK", status: "DISABLED" });
  });

  it("POST mollie ACTIVE requires credentialsRef", async () => {
    const token = await superToken();
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MOLLIE",
        mode: "TEST",
        status: "ACTIVE",
        config: { webhookTokens: [WEBHOOK_TOKEN] },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_CREDENTIALS_REF_REQUIRED" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST mollie DISABLED does not require credentialsRef", async () => {
    const token = await superToken();
    prisma.paymentProvider.create.mockResolvedValueOnce({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      type: "MOLLIE",
      mode: "TEST",
      status: "DISABLED",
      credentialsRef: null,
      config: { webhookTokens: [WEBHOOK_TOKEN] },
      createdAt: new Date("2026-02-24T00:00:00.000Z"),
      updatedAt: new Date("2026-02-24T00:00:00.000Z"),
    });

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MOLLIE",
        mode: "TEST",
        status: "DISABLED",
        config: { webhookTokens: [WEBHOOK_TOKEN] },
      },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: "MOLLIE", status: "DISABLED", credentialsRef: null });
  });

  it("POST mollie ACTIVE requires secret present in env", async () => {
    const token = await superToken();
    delete process.env.MOLLIE_KEY;
    prisma.paymentProvider.create.mockClear();

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MOLLIE",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: "MOLLIE_KEY",
        config: { webhookTokens: [WEBHOOK_TOKEN] },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.create).not.toHaveBeenCalled();
  });

  it("POST mollie creates provider when valid", async () => {
    const token = await superToken();
    process.env.MOLLIE_KEY = "test_x";
    prisma.paymentProvider.create.mockResolvedValueOnce({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      type: "MOLLIE",
      mode: "TEST",
      status: "ACTIVE",
      credentialsRef: "MOLLIE_KEY",
      config: { webhookTokens: [WEBHOOK_TOKEN] },
      createdAt: new Date("2026-02-24T00:00:00.000Z"),
      updatedAt: new Date("2026-02-24T00:00:00.000Z"),
    });

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        type: "MOLLIE",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: "MOLLIE_KEY",
        config: { webhookTokens: [WEBHOOK_TOKEN] },
      },
    });
    delete process.env.MOLLIE_KEY;
    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({ type: "MOLLIE", status: "ACTIVE", credentialsRef: "MOLLIE_KEY" });
  });

  it("PATCH 404 when provider not found", async () => {
    const token = await superToken();
    prisma.paymentProvider.findFirst.mockResolvedValueOnce(null);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "DISABLED" },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_NOT_FOUND" });
  });

  it("POST rotates webhook token (keeps previous by default)", async () => {
    const token = await superToken();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      tenantId: TENANT_ID,
      type: "LIQPAY",
      mode: "TEST",
      status: "ACTIVE",
      credentialsRef: null,
      config: { webhookTokens: [WEBHOOK_TOKEN] },
    });
    prisma.paymentProvider.update.mockImplementationOnce(async (args: any) => {
      return {
        id: PROVIDER_ID,
        tenantId: TENANT_ID,
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: null,
        config: args.data.config,
        updatedAt: new Date("2026-02-25T00:00:00.000Z"),
      };
    });

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}/webhook-token/rotate`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {},
    });
    expect(res.statusCode).toBe(200);
    const body = res.json() as any;
    expect(body.ok).toBe(true);
    expect(typeof body.newToken).toBe("string");
    expect(body.newToken).toMatch(/^[A-Za-z0-9_-]{24,128}$/);
    expect(body.provider?.config?.webhookTokens?.[0]).toBe(body.newToken);
    expect(body.provider?.config?.webhookTokens).toContain(WEBHOOK_TOKEN);
  });

  it("PATCH validates config for existing provider type", async () => {
    const token = await superToken();
    prisma.paymentProvider.findFirst.mockResolvedValueOnce({ id: PROVIDER_ID, type: "LIQPAY", credentialsRef: null, status: "ACTIVE", config: { webhookTokens: [WEBHOOK_TOKEN] } });
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: {
        config: {
          webhookTokens: [WEBHOOK_TOKEN],
          liqpay: {
            publicKey: "pub",
            // missing currentSecretRef
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_LIQPAY_CONFIG_MISSING" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("PATCH liqpay DISABLED→ACTIVE requires secret present in env", async () => {
    const token = await superToken();
    delete process.env.LIQPAY_PRIVATE_KEY;
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "LIQPAY",
      credentialsRef: null,
      status: "DISABLED",
      config: {
        webhookTokens: [WEBHOOK_TOKEN],
        liqpay: {
          publicKey: "pub",
          currentSecretRef: "LIQPAY_PRIVATE_KEY",
          signatureInAlgorithms: ["sha1"],
          signatureOutAlgorithm: "sha1",
          version: 3,
        },
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("PATCH liqpay DISABLED→ACTIVE requires previous secret if not expired", async () => {
    const token = await superToken();
    process.env.LIQPAY_PRIVATE_KEY = "priv";
    delete process.env.LIQPAY_PRIVATE_KEY_PREV;
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "LIQPAY",
      credentialsRef: null,
      status: "DISABLED",
      config: {
        webhookTokens: [WEBHOOK_TOKEN],
        liqpay: {
          publicKey: "pub",
          currentSecretRef: "LIQPAY_PRIVATE_KEY",
          previousSecretRef: "LIQPAY_PRIVATE_KEY_PREV",
          previousValidUntil: "2099-01-01T00:00:00.000Z",
          signatureInAlgorithms: ["sha1"],
          signatureOutAlgorithm: "sha1",
          version: 3,
        },
      },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });

    delete process.env.LIQPAY_PRIVATE_KEY;
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("PATCH mollie DISABLED→ACTIVE requires secret present in env", async () => {
    const token = await superToken();
    delete process.env.MOLLIE_KEY;
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "MOLLIE",
      credentialsRef: "MOLLIE_KEY",
      status: "DISABLED",
      config: { webhookTokens: [WEBHOOK_TOKEN] },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });

    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("PATCH mollie DISABLED→ACTIVE requires config object (cannot be null)", async () => {
    const token = await superToken();
    process.env.MOLLIE_KEY = "test_x";
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "MOLLIE",
      credentialsRef: "MOLLIE_KEY",
      status: "DISABLED",
      config: null,
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });

    delete process.env.MOLLIE_KEY;
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_CONFIG_NOT_OBJECT" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("PATCH mollie DISABLED→ACTIVE requires webhookTokens even when PATCH payload omits config", async () => {
    const token = await superToken();
    process.env.MOLLIE_KEY = "test_x";
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "MOLLIE",
      credentialsRef: "MOLLIE_KEY",
      status: "DISABLED",
      config: {},
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });

    delete process.env.MOLLIE_KEY;
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_MISSING" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("PATCH monobank DISABLED→ACTIVE requires webhookTokens even when PATCH payload omits config", async () => {
    const token = await superToken();
    process.env.MONO_TOKEN = "mono-token";
    prisma.paymentProvider.update.mockClear();

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "MONOBANK",
      credentialsRef: "MONO_TOKEN",
      status: "DISABLED",
      config: { monobank: { webhookPublicKeysPem: ["pem"] } },
    });

    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}`,
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      payload: { status: "ACTIVE" },
    });

    delete process.env.MONO_TOKEN;
    expect(res.statusCode).toBe(422);
    expect(res.json()).toMatchObject({ code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_MISSING" });
    expect(prisma.paymentProvider.update).not.toHaveBeenCalled();
  });

  it("POST monobank refresh-pubkey updates config using provider token", async () => {
    const token = await superToken();
    process.env.MONO_TOKEN = "mono-token";

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ key: "-----BEGIN PUBLIC KEY-----\nabc\n-----END PUBLIC KEY-----\n" }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    prisma.paymentProvider.findFirst.mockResolvedValueOnce({
      id: PROVIDER_ID,
      type: "MONOBANK",
      credentialsRef: "MONO_TOKEN",
      config: { webhookTokens: [WEBHOOK_TOKEN], monobank: { webhookPublicKeysPem: ["old"] } },
    });
    prisma.paymentProvider.update.mockResolvedValueOnce({ id: PROVIDER_ID, updatedAt: new Date() });

    const res = await app.inject({
      method: "POST",
      url: `/super/tenants/${TENANT_ID}/payment-providers/${PROVIDER_ID}/monobank/refresh-pubkey`,
      headers: { authorization: `Bearer ${token}` },
    });

    vi.unstubAllGlobals();
    delete process.env.MONO_TOKEN;

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, updated: true, providerId: PROVIDER_ID });
    expect(prisma.paymentProvider.update).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
