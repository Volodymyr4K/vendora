import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from "vitest";
import Fastify, { type FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { rawBodyPlugin } from "../../plugins/raw-body.js";
import { tenantContextPlugin } from "../../plugins/tenant-context.js";
import { webhooksRoutes } from "../../domains/infra/webhooks.routes.js";
import { envSecretResolver } from "../../services/secrets.js";

describe("monobank webhook signature (raw bytes)", () => {
  let app: FastifyInstance;
  const paymentEventCreate = vi.fn(async () => ({ id: "evt1" }));
  const paymentProviderUpdate = vi.fn(async () => ({ id: "provider-mono" }));
  const providerConfigs: Record<string, any> = {};

  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  const { publicKey: rotatedPublicKey, privateKey: rotatedPrivateKey } = crypto.generateKeyPairSync("ec", {
    namedCurve: "prime256v1",
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs8", format: "pem" },
  });

  beforeAll(async () => {
    app = Fastify({ logger: false });
    await rawBodyPlugin(app);
    await tenantContextPlugin(app);

    process.env.MONOBANK_TOKEN_REF = "mono-token";

    providerConfigs["provider-mono"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };
    providerConfigs["provider-mono-rotated"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };

    const prisma = {
      paymentProvider: {
        findFirst: async ({ where }: any) => {
          if (where?.type !== "MONOBANK") return null;
          if (!providerConfigs[where?.id]) return null;
          return {
            id: where.id,
            tenantId: "tenant1",
            type: "MONOBANK",
            credentialsRef: "MONOBANK_TOKEN_REF",
            config: providerConfigs[where.id],
          };
        },
        update: paymentProviderUpdate,
      },
      paymentEvent: { create: paymentEventCreate },
    };

    await webhooksRoutes(app, { prisma: prisma as any, secrets: envSecretResolver() });
    await app.ready();
  });

  beforeEach(() => {
    paymentEventCreate.mockClear();
    paymentProviderUpdate.mockClear();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  afterAll(async () => {
    await app.close();
  });

  afterAll(() => {
    delete process.env.MONOBANK_TOKEN_REF;
  });

  it("accepts valid signature and inserts event", async () => {
    providerConfigs["provider-mono-rotated"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };
    const payload = "{\"invoiceId\":\"inv_1\",\"modifiedDate\":1700000000}";
    const signature = crypto.sign("sha256", Buffer.from(payload, "utf8"), privateKey).toString("base64");

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono-rotated?t=token",
      payload,
      headers: {
        "content-type": "application/json",
        "x-sign": signature,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(paymentEventCreate).toHaveBeenCalledTimes(1);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(0);
  });

  it("rejects signature when raw body differs only by whitespace", async () => {
    providerConfigs["provider-mono"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };
    const payload = "{\n  \"invoiceId\": \"inv_1\",\n  \"modifiedDate\": 1700000000\n}\n";
    const signatureForDifferentBody = crypto
      .sign("sha256", Buffer.from("{\"invoiceId\":\"inv_1\",\"modifiedDate\":1700000000}", "utf8"), privateKey)
      .toString("base64");

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono?t=token",
      payload,
      headers: {
        "content-type": "application/json",
        "x-sign": signatureForDifferentBody,
      },
    });

    expect(res.statusCode).toBe(403);
    expect(paymentEventCreate).toHaveBeenCalledTimes(0);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(0);
  });

  it("refreshes pubkey on invalid signature (rotation) and then inserts event", async () => {
    providerConfigs["provider-mono-rotated"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ key: rotatedPublicKey }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = "{\"invoiceId\":\"inv_1\",\"modifiedDate\":1700000000}";
    const signature = crypto.sign("sha256", Buffer.from(payload, "utf8"), rotatedPrivateKey).toString("base64");
    expect(
      crypto.verify("sha256", Buffer.from(payload, "utf8"), rotatedPublicKey, Buffer.from(signature, "base64"))
    ).toBe(true);

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono-rotated?t=token",
      payload,
      headers: {
        "content-type": "application/json",
        "x-sign": signature,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(paymentEventCreate).toHaveBeenCalledTimes(1);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("accepts signature verified by second stored pubkey without refresh", async () => {
    providerConfigs["provider-mono-multikey"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey, rotatedPublicKey] },
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ key: rotatedPublicKey }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = "{\"invoiceId\":\"inv_2\",\"modifiedDate\":1700000000}";
    const signature = crypto.sign("sha256", Buffer.from(payload, "utf8"), rotatedPrivateKey).toString("base64");

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono-multikey?t=token",
      payload,
      headers: {
        "content-type": "application/json",
        "x-sign": signature,
      },
    });

    expect(res.statusCode).toBe(200);
    expect(paymentEventCreate).toHaveBeenCalledTimes(1);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("does not attempt pubkey refresh when x-sign is missing (prevents abuse)", async () => {
    providerConfigs["provider-mono-missing-sign"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ key: rotatedPublicKey }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = "{\"invoiceId\":\"inv_3\",\"modifiedDate\":1700000000}";

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono-missing-sign?t=token",
      payload,
      headers: {
        "content-type": "application/json",
        // Intentionally omit x-sign
      },
    });

    expect(res.statusCode).toBe(403);
    expect(paymentEventCreate).toHaveBeenCalledTimes(0);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(0);
    expect(fetchMock).toHaveBeenCalledTimes(0);
  });

  it("throttles pubkey refresh attempts on repeated invalid signatures", async () => {
    providerConfigs["provider-mono-throttle"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };

    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => new Date("2026-02-25T00:00:00.000Z").getTime());

    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: new Headers({ "content-type": "application/json" }),
      text: async () => JSON.stringify({ key: rotatedPublicKey }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    const payload = "{\"invoiceId\":\"inv_4\",\"modifiedDate\":1700000000}";
    const signature = crypto.sign("sha256", Buffer.from(payload, "utf8"), crypto.generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    }).privateKey).toString("base64");

    const res1 = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono-throttle?t=token",
      payload,
      headers: { "content-type": "application/json", "x-sign": signature },
    });
    expect(res1.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Same moment: should be throttled => no second fetch.
    const res2 = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono-throttle?t=token",
      payload,
      headers: { "content-type": "application/json", "x-sign": signature },
    });
    expect(res2.statusCode).toBe(403);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(paymentEventCreate).toHaveBeenCalledTimes(0);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(0);

    nowSpy.mockRestore();
  });

  it("rejects invalid token with 404 before signature verification (anti-enumeration)", async () => {
    providerConfigs["provider-mono"] = {
      webhookTokens: ["token"],
      monobank: { webhookPublicKeysPem: [publicKey] },
    };

    const payload = "{\"invoiceId\":\"inv_1\",\"modifiedDate\":1700000000}";

    const res = await app.inject({
      method: "POST",
      url: "/webhooks/payments/monobank/provider-mono?t=wrong",
      payload,
      headers: {
        "content-type": "application/json",
        // Intentionally omit x-sign: token must be validated before any signature logic runs.
      },
    });

    expect(res.statusCode).toBe(404);
    expect(paymentEventCreate).toHaveBeenCalledTimes(0);
    expect(paymentProviderUpdate).toHaveBeenCalledTimes(0);
  });
});
