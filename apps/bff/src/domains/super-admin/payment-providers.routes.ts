import type { FastifyInstance } from "fastify";
import { PaymentProviderType, Prisma, type PrismaClient } from "@vendora/database";
import { z } from "zod";
import crypto from "node:crypto";

import { PaymentProviderCreateSchema, PaymentProviderUpdateSchema } from "../../schemas/super-admin/payment-providers.schema.js";
import { monobankFetchPubkeyPem } from "../../services/payments/providers/monobank.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isUniqueViolation(err: any) {
  return err?.code === "P2002";
}

function parseWebhookTokens(config: Record<string, unknown>) {
  const raw = config.webhookTokens;
  const tokensRaw = Array.isArray(raw)
    ? raw
        .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
        .map((t) => t.trim())
    : [];
  const unique = Array.from(new Set(tokensRaw));
  return unique;
}

function isValidWebhookToken(token: string) {
  return /^[A-Za-z0-9_-]{16,128}$/.test(token);
}

type ConfigValidationResult =
  | { ok: true; normalized: Record<string, unknown> }
  | { ok: false; code: string };

function validateWebhookTokens(tokens: string[]) {
  if (tokens.length === 0) return { ok: false as const, code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_MISSING" as const };
  if (tokens.length > 4) return { ok: false as const, code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_INVALID" as const };
  for (const t of tokens) {
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(t)) {
      return { ok: false as const, code: "PAYMENTS_PROVIDER_WEBHOOK_TOKENS_INVALID" as const };
    }
  }
  return { ok: true as const };
}

function randomWebhookToken(len: number) {
  // base64url without '=' padding, then slice to requested length
  const raw = crypto.randomBytes(Math.max(16, Math.ceil((len * 3) / 4)));
  return raw.toString("base64url").slice(0, len);
}

function validateConfigForType(type: PaymentProviderType, config: unknown): ConfigValidationResult {
  if (!isPlainObject(config)) return { ok: false, code: "PAYMENTS_PROVIDER_CONFIG_NOT_OBJECT" };

  const webhookTokens = parseWebhookTokens(config);
  const tokenValidation = validateWebhookTokens(webhookTokens);
  if (!tokenValidation.ok) return { ok: false, code: tokenValidation.code };

  const normalized: Record<string, unknown> = { ...(config as any), webhookTokens };

  if (type === "LIQPAY") {
    const liqpay = (normalized as any).liqpay;
    if (!isPlainObject(liqpay)) return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_CONFIG_MISSING" };

    if ("privateKey" in liqpay) return { ok: false, code: "PAYMENTS_PROVIDER_SECRET_MUST_NOT_BE_IN_DB" };

    const publicKey = typeof liqpay.publicKey === "string" ? liqpay.publicKey.trim() : "";
    const currentSecretRef = typeof liqpay.currentSecretRef === "string" ? liqpay.currentSecretRef.trim() : "";
    if (!publicKey || !currentSecretRef) return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_CONFIG_MISSING" };

    const signatureOutAlgorithm = liqpay.signatureOutAlgorithm;
    if (signatureOutAlgorithm !== "sha1" && signatureOutAlgorithm !== "sha3-256") {
      return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_SIGNATURE_OUT_ALGORITHM_INVALID" };
    }

    const signatureInAlgorithmsRaw = liqpay.signatureInAlgorithms;
    const signatureInAlgorithms = Array.isArray(signatureInAlgorithmsRaw)
      ? signatureInAlgorithmsRaw.filter((a): a is string => a === "sha1" || a === "sha3-256")
      : [];
    if (signatureInAlgorithms.length === 0) return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_SIGNATURE_IN_ALGORITHMS_MISSING" };

    const version = Number(liqpay.version);
    if (!Number.isFinite(version) || version !== 3) return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_VERSION_INVALID" };

    if (liqpay.previousSecretRef != null) {
      if (typeof liqpay.previousSecretRef !== "string" || liqpay.previousSecretRef.trim().length === 0) {
        return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_PREVIOUS_SECRET_REF_INVALID" };
      }
      if (liqpay.previousValidUntil != null) {
        if (typeof liqpay.previousValidUntil !== "string" || !Number.isFinite(Date.parse(liqpay.previousValidUntil))) {
          return { ok: false, code: "PAYMENTS_PROVIDER_LIQPAY_PREVIOUS_VALID_UNTIL_INVALID" };
        }
      }
    }
  }

  if (type === "MONOBANK") {
    const monobank = (normalized as any).monobank;
    if (!isPlainObject(monobank)) return { ok: false, code: "PAYMENTS_PROVIDER_MONOBANK_CONFIG_MISSING" };
    const keysRaw = (monobank as any).webhookPublicKeysPem;
    // Note: keys may be provisioned later via refresh endpoint; ACTIVE status is gated separately.
    void keysRaw;
  }

  // MOLLIE: accept webhookTokens only for now; API credentials will be validated once checkout/verify is implemented.

  return { ok: true, normalized };
}

function requireEnvSecret(ref: string | undefined | null) {
  const name = typeof ref === "string" ? ref.trim() : "";
  if (!name) return { ok: false as const, code: "PAYMENTS_PROVIDER_SECRET_REF_MISSING" as const };
  const value = process.env[name];
  if (!value) return { ok: false as const, code: "PAYMENTS_PROVIDER_SECRET_MISSING" as const };
  return { ok: true as const };
}

function liqpayRequiredSecretRefs(config: Record<string, unknown>) {
  const liqpay = (config as any).liqpay;
  const currentSecretRef = typeof liqpay?.currentSecretRef === "string" ? liqpay.currentSecretRef.trim() : "";
  const previousSecretRef = typeof liqpay?.previousSecretRef === "string" ? liqpay.previousSecretRef.trim() : "";
  const previousValidUntil = typeof liqpay?.previousValidUntil === "string" ? liqpay.previousValidUntil.trim() : "";

  const refs = [];
  if (currentSecretRef) refs.push(currentSecretRef);
  if (previousSecretRef) {
    // Align with webhook ingress logic: previous secret is only used while it is not expired.
    const untilMs = previousValidUntil ? Date.parse(previousValidUntil) : Number.NaN;
    const allowPrevious = !previousValidUntil || (Number.isFinite(untilMs) && untilMs > Date.now());
    if (allowPrevious) refs.push(previousSecretRef);
  }
  return refs;
}

function monobankHasAnyPubkey(config: unknown): boolean {
  if (!isPlainObject(config)) return false;
  const monobank = (config as any).monobank;
  if (!isPlainObject(monobank)) return false;
  const keysRaw = (monobank as any).webhookPublicKeysPem;
  const keys = Array.isArray(keysRaw) ? keysRaw.filter((k): k is string => typeof k === "string" && k.trim().length > 0) : [];
  return keys.length > 0;
}

function upsertMonobankPubkeyPem(config: unknown, pubkeyPem: string): Record<string, unknown> {
  const base = isPlainObject(config) ? config : {};
  const monobank = isPlainObject((base as any).monobank) ? (base as any).monobank as Record<string, unknown> : {};
  const rawKeys = (monobank as any).webhookPublicKeysPem;
  const currentKeys = Array.isArray(rawKeys) ? rawKeys.filter((k): k is string => typeof k === "string" && k.trim().length > 0).map((k) => k.trim()) : [];
  const nextKeys = Array.from(new Set([pubkeyPem.trim(), ...currentKeys])).slice(0, 2);
  return {
    ...base,
    monobank: {
      ...monobank,
      webhookPublicKeysPem: nextKeys,
    },
  };
}

type Deps = {
  prisma: PrismaClient;
};

export async function routesSuperPaymentProviders(app: FastifyInstance, deps: Deps) {
  // Mounted by super-admin scope at: /super/tenants
  // Routes here are tenant-scoped by :tenantId param and intended for super-admin only.

  app.get<{
    Params: { tenantId: string };
  }>("/:tenantId/payment-providers", {
    schema: {
      params: z.object({ tenantId: z.string().uuid() }),
    },
  }, async (req, reply) => {
    const rows = await deps.prisma.paymentProvider.findMany({
      where: { tenantId: req.params.tenantId },
      select: {
        id: true,
        tenantId: true,
        type: true,
        mode: true,
        status: true,
        credentialsRef: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: [{ type: "asc" }, { mode: "asc" }, { createdAt: "desc" }],
    });
    return reply.send({ items: rows });
  });

  app.post<{
    Params: { tenantId: string };
    Body: z.infer<typeof PaymentProviderCreateSchema>;
  }>("/:tenantId/payment-providers", {
    schema: {
      params: z.object({ tenantId: z.string().uuid() }),
      body: PaymentProviderCreateSchema,
    },
  }, async (req, reply) => {
    const { tenantId } = req.params;

    const tenant = await deps.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) return reply.code(404).send({ error: "Tenant not found", code: "TENANT_NOT_FOUND" });

    const defaultStatus = req.body.type === "MONOBANK" ? "DISABLED" : "ACTIVE";
    const status = req.body.status ?? defaultStatus;

    if ((req.body.type === "MONOBANK" || req.body.type === "MOLLIE") && status === "ACTIVE" && !req.body.credentialsRef) {
      return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_CREDENTIALS_REF_REQUIRED" });
    }

    const cfg = req.body.config ?? undefined;
    const v = validateConfigForType(req.body.type, cfg);
    if (!v.ok) return reply.code(422).send({ error: "Invalid payment provider config", code: v.code });

    if (req.body.type === "MONOBANK" && status === "ACTIVE" && !monobankHasAnyPubkey(v.normalized)) {
      return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_MONOBANK_PUBLIC_KEYS_REQUIRED_FOR_ACTIVE" });
    }

    if (req.body.type === "LIQPAY" && status === "ACTIVE") {
      for (const ref of liqpayRequiredSecretRefs(v.normalized)) {
        const r = requireEnvSecret(ref);
        if (!r.ok) return reply.code(422).send({ error: "Payment provider not configured", code: r.code });
      }
    }

    if ((req.body.type === "MONOBANK" || req.body.type === "MOLLIE") && status === "ACTIVE") {
      const tokenRef = req.body.credentialsRef ?? "";
      if (!tokenRef) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_REF_MISSING" });
      }
      const token = process.env[tokenRef];
      if (!token) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
      }
    }

    try {
      const created = await deps.prisma.paymentProvider.create({
        data: {
          tenantId,
          type: req.body.type,
          mode: req.body.mode,
          status,
          credentialsRef: req.body.credentialsRef ?? undefined,
          config: v.normalized as Prisma.InputJsonValue,
        },
        select: {
          id: true,
          tenantId: true,
          type: true,
          mode: true,
          status: true,
          credentialsRef: true,
          config: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      return reply.code(201).send(created);
    } catch (err: any) {
      if (!isUniqueViolation(err)) throw err;
      return reply.code(409).send({ error: "Payment provider already exists for this tenant/mode/type", code: "PAYMENTS_PROVIDER_ALREADY_EXISTS" });
    }
  });

  app.patch<{
    Params: { tenantId: string; providerId: string };
    Body: z.infer<typeof PaymentProviderUpdateSchema>;
  }>("/:tenantId/payment-providers/:providerId", {
    schema: {
      params: z.object({ tenantId: z.string().uuid(), providerId: z.string().uuid() }),
      body: PaymentProviderUpdateSchema,
    },
  }, async (req, reply) => {
    const { tenantId, providerId } = req.params;

    const existing = await deps.prisma.paymentProvider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, type: true, credentialsRef: true, status: true, config: true },
    });
    if (!existing) return reply.code(404).send({ error: "Payment provider not found", code: "PAYMENTS_PROVIDER_NOT_FOUND" });

    const typeRequiresCredentialsRef = existing.type === "MONOBANK" || existing.type === "MOLLIE";
    const nextCredentialsRef =
      req.body.credentialsRef === undefined ? existing.credentialsRef : (req.body.credentialsRef === null ? null : req.body.credentialsRef);
    const nextStatus = req.body.status ?? existing.status;
    if (typeRequiresCredentialsRef && nextStatus === "ACTIVE" && !nextCredentialsRef) {
      return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_CREDENTIALS_REF_REQUIRED" });
    }

    const configWasProvided = req.body.config !== undefined;
    let config: Record<string, unknown> | undefined;
    if (configWasProvided && req.body.config !== null) {
      const v = validateConfigForType(existing.type, req.body.config);
      if (!v.ok) return reply.code(422).send({ error: "Invalid payment provider config", code: v.code });
      config = v.normalized;
    }

    const effectiveConfig =
      !configWasProvided
        ? existing.config
        : (req.body.config === null ? null : (config ?? req.body.config));

    let normalizedEffectiveConfigWhenActive: Record<string, unknown> | undefined;
    if (nextStatus === "ACTIVE") {
      const v = validateConfigForType(existing.type, effectiveConfig);
      if (!v.ok) return reply.code(422).send({ error: "Invalid payment provider config", code: v.code });
      normalizedEffectiveConfigWhenActive = v.normalized;
    }

    if (existing.type === "MONOBANK" && nextStatus === "ACTIVE") {
      if (!monobankHasAnyPubkey(effectiveConfig)) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_MONOBANK_PUBLIC_KEYS_REQUIRED_FOR_ACTIVE" });
      }
    }

    if (existing.type === "LIQPAY" && nextStatus === "ACTIVE") {
      const normalizedConfig = normalizedEffectiveConfigWhenActive ?? (isPlainObject(effectiveConfig) ? (effectiveConfig as Record<string, unknown>) : {});
      for (const ref of liqpayRequiredSecretRefs(normalizedConfig)) {
        const r = requireEnvSecret(ref);
        if (!r.ok) return reply.code(422).send({ error: "Payment provider not configured", code: r.code });
      }
    }

    if ((existing.type === "MONOBANK" || existing.type === "MOLLIE") && nextStatus === "ACTIVE") {
      const tokenRef = nextCredentialsRef ?? "";
      if (!tokenRef) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_REF_MISSING" });
      }
      const token = process.env[tokenRef];
      if (!token) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
      }
    }

    const updated = await deps.prisma.paymentProvider.update({
      where: { id: existing.id },
      data: {
        status: req.body.status ?? undefined,
        credentialsRef: req.body.credentialsRef === null ? null : req.body.credentialsRef ?? undefined,
        config: req.body.config === null ? Prisma.JsonNull : (config as Prisma.InputJsonValue | undefined),
      },
      select: {
        id: true,
        tenantId: true,
        type: true,
        mode: true,
        status: true,
        credentialsRef: true,
        config: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return reply.send(updated);
  });

  app.post<{
    Params: { tenantId: string; providerId: string };
    Body: { keepPrevious?: boolean } | undefined;
  }>("/:tenantId/payment-providers/:providerId/webhook-token/rotate", {
    schema: {
      params: z.object({ tenantId: z.string().uuid(), providerId: z.string().uuid() }),
      body: z.object({ keepPrevious: z.boolean().optional() }).optional(),
    },
  }, async (req, reply) => {
    const { tenantId, providerId } = req.params;
    const keepPrevious = req.body?.keepPrevious !== false;

    const provider = await deps.prisma.paymentProvider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, config: true },
    });
    if (!provider) return reply.code(404).send({ error: "Payment provider not found", code: "PAYMENTS_PROVIDER_NOT_FOUND" });

    const baseConfig = isPlainObject(provider.config) ? (provider.config as Record<string, unknown>) : {};
    const currentTokens = parseWebhookTokens(baseConfig);

    let newToken = "";
    for (let i = 0; i < 5; i += 1) {
      const candidate = randomWebhookToken(40);
      if (/^[A-Za-z0-9_-]{24,128}$/.test(candidate) && !currentTokens.includes(candidate)) {
        newToken = candidate;
        break;
      }
    }
    if (!newToken) return reply.code(500).send({ error: "Failed to generate token", code: "PAYMENTS_PROVIDER_TOKEN_GENERATION_FAILED" });

    const previousTokens = keepPrevious ? currentTokens.filter(isValidWebhookToken) : [];
    const nextTokens = Array.from(new Set([newToken, ...previousTokens])).slice(0, 2);

    const tokenValidation = validateWebhookTokens(nextTokens);
    if (!tokenValidation.ok) {
      return reply.code(500).send({ error: "Token generation failed", code: tokenValidation.code });
    }

    const nextConfig = { ...baseConfig, webhookTokens: nextTokens };

    const updated = await deps.prisma.paymentProvider.update({
      where: { id: provider.id },
      data: { config: nextConfig as Prisma.InputJsonValue },
      select: { id: true, tenantId: true, type: true, mode: true, status: true, credentialsRef: true, config: true, updatedAt: true },
    });

    return reply.send({ ok: true, provider: updated, newToken });
  });

  app.post<{
    Params: { tenantId: string; providerId: string };
  }>("/:tenantId/payment-providers/:providerId/monobank/refresh-pubkey", {
    schema: {
      params: z.object({ tenantId: z.string().uuid(), providerId: z.string().uuid() }),
    },
  }, async (req, reply) => {
    const { tenantId, providerId } = req.params;

    const provider = await deps.prisma.paymentProvider.findFirst({
      where: { id: providerId, tenantId },
      select: { id: true, type: true, credentialsRef: true, config: true },
    });
    if (!provider) return reply.code(404).send({ error: "Payment provider not found", code: "PAYMENTS_PROVIDER_NOT_FOUND" });
    if (provider.type !== "MONOBANK") {
      return reply.code(422).send({ error: "Wrong provider type", code: "PAYMENTS_PROVIDER_TYPE_MISMATCH" });
    }

    const tokenRef = typeof provider.credentialsRef === "string" ? provider.credentialsRef : "";
    if (!tokenRef) {
      return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_REF_MISSING" });
    }
    const token = process.env[tokenRef];
    if (!token) {
      return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
    }

    let pubkeyPem: string;
    try {
      pubkeyPem = await monobankFetchPubkeyPem({ token, timeoutMs: 4500, retries: 1, backoffMs: 250 });
    } catch {
      return reply.code(502).send({ error: "Provider error", code: "PAYMENTS_PROVIDER_UPSTREAM_ERROR" });
    }

    const nextConfig = upsertMonobankPubkeyPem(provider.config, pubkeyPem);
    const updated = await deps.prisma.paymentProvider.update({
      where: { id: provider.id },
      data: { config: nextConfig as Prisma.InputJsonValue },
      select: { id: true, updatedAt: true },
    });

    return reply.send({ ok: true, updated: true, providerId: updated.id });
  });
}
