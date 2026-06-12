import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PrismaClient } from "@vendora/database";
import { validateTenant } from "../../plugins/tenant-guard.js";
import { currencyExponentFromIso } from "../../services/payments/currency-exponent.js";
import { selectPaymentProviderForCheckout } from "../../services/payments/provider-selection.js";
import {
  computePaymentCheckoutRequestHash,
  resolvePaymentCheckoutIdempotency,
  bindPaymentCheckoutRequest,
} from "../../services/payments/checkout-idempotency.js";
import { liqpayCheckoutDataAndSignature, type LiqpaySignatureAlgorithm } from "../../services/payments/providers/liqpay.js";
import { monobankCreateInvoice } from "../../services/payments/providers/monobank.js";
import { mollieCreatePayment } from "../../services/payments/providers/mollie.js";

type Deps = {
  prisma: PrismaClient;
  config: { PAYMENTS_MODE: "TEST" | "LIVE" };
};

const zCheckoutBody = z
  .object({
    orderToken: z.string().min(1),
    providerId: z.string().min(1).optional(),
  })
  .strict();

const zCheckoutOkResponse = z.object({
  transactionId: z.string().uuid(),
  checkoutUrl: z.string().url().nullable(),
  status: z.string(),
});

export async function routesPayments(app: FastifyInstance, deps: Deps) {
  app.post("/payments/checkout", {
    schema: {
      body: zCheckoutBody,
      response: {
        200: zCheckoutOkResponse,
        400: z.object({ error: z.string(), code: z.string() }),
        404: z.object({ error: z.string() }),
        409: z.object({ error: z.string(), code: z.string() }),
        422: z.object({ error: z.string(), code: z.string() }),
        501: z.object({ error: z.string(), code: z.string(), transactionId: z.string().uuid() }),
        500: z.object({ error: z.string(), code: z.string() }),
      },
    },
  }, async (req, reply) => {
    const tenant = validateTenant(req);

    const idempotencyKey = req.headers["idempotency-key"] as string | undefined;
    if (!idempotencyKey) {
      return reply.code(400).send({ error: "Missing 'Idempotency-Key' header", code: "MISSING_IDEMPOTENCY_KEY" });
    }

    const body = zCheckoutBody.parse(req.body);
    const requestHash = computePaymentCheckoutRequestHash({
      orderToken: body.orderToken,
      providerId: body.providerId ?? null,
    });

    // Fast path: idempotency HIT returns the existing attempt (including checkoutUrl if present).
    const idem = await resolvePaymentCheckoutIdempotency({
      prisma: deps.prisma,
      tenantId: tenant.id,
      idempotencyKey,
      requestHash,
    });
    if (idem.kind === "CONFLICT") {
      return reply.code(409).send({ error: "Idempotency conflict", code: "IDEMPOTENCY_CONFLICT" });
    }
    if (idem.kind === "HIT") {
      const tx = await deps.prisma.paymentTransaction.findUnique({
        where: { tenantId_id: { tenantId: tenant.id, id: idem.transactionId } },
        select: { id: true, checkoutUrl: true, status: true },
      });
      if (tx) {
        return reply.code(200).send({
          transactionId: tx.id,
          checkoutUrl: tx.checkoutUrl ?? null,
          status: tx.status,
        });
      }
      // Fallthrough if the referenced transaction is missing (should never happen).
    }

    const providerSel = await selectPaymentProviderForCheckout({
      prisma: deps.prisma,
      tenantId: tenant.id,
      mode: deps.config.PAYMENTS_MODE,
      providerId: body.providerId,
    });
    if (!providerSel.ok) {
      const code =
        providerSel.code === "NO_ACTIVE_PROVIDER_FOR_MODE"
          ? "PAYMENTS_NO_ACTIVE_PROVIDER"
          : providerSel.code === "MULTIPLE_ACTIVE_PROVIDERS_REQUIRE_PROVIDER_ID"
            ? "PAYMENTS_PROVIDER_ID_REQUIRED"
            : "PAYMENTS_PROVIDER_INVALID";
      return reply.code(422).send({ error: "Payment provider not available", code });
    }

    const selectedProviderId = providerSel.provider.id;

    const res = await deps.prisma.$transaction(async (tx) => {
      const lockedOrders = await tx.$queryRaw<
        { id: string; total: number; currency: string; branchSlug: string }[]
      >`SELECT id, total, currency, "branchSlug" FROM "Order" WHERE "tenantId" = ${tenant.id} AND token = ${body.orderToken} FOR UPDATE`;

      const order = lockedOrders[0];
      if (!order) return { kind: "ORDER_NOT_FOUND" as const };

      const currencyExponent = currencyExponentFromIso(order.currency);
      if (currencyExponent === null) return { kind: "UNSUPPORTED_CURRENCY" as const };
      if (currencyExponent !== 2) return { kind: "UNSUPPORTED_EXPONENT" as const };

      // Re-check idempotency inside the lock (race-safe).
      const idem2 = await resolvePaymentCheckoutIdempotency({
        prisma: tx as unknown as PrismaClient,
        tenantId: tenant.id,
        idempotencyKey,
        requestHash,
      });
      if (idem2.kind === "CONFLICT") return { kind: "IDEMPOTENCY_CONFLICT" as const };
      if (idem2.kind === "HIT") {
        const existing = await tx.paymentTransaction.findUnique({
          where: { tenantId_id: { tenantId: tenant.id, id: idem2.transactionId } },
          select: { id: true, checkoutUrl: true, status: true, providerId: true, externalId: true },
        });
        if (existing) return { kind: "DONE" as const, tx: existing, branchSlug: order.branchSlug };
      }

      const active = await tx.paymentTransaction.findFirst({
        where: {
          tenantId: tenant.id,
          orderDbId: order.id,
          status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
        },
        select: { id: true, providerId: true, checkoutUrl: true, status: true, externalId: true },
        orderBy: { createdAt: "desc" },
      });

      if (active) {
        if (body.providerId && active.providerId !== body.providerId) return { kind: "ACTIVE_PROVIDER_MISMATCH" as const };

        const bindRes = await bindPaymentCheckoutRequest({
          prisma: tx as unknown as PrismaClient,
          tenantId: tenant.id,
          idempotencyKey,
          requestHash,
          orderDbId: order.id,
          providerId: active.providerId,
          transactionId: active.id,
        });
        if (!bindRes.ok) return { kind: "IDEMPOTENCY_CONFLICT" as const };

        return { kind: "DONE" as const, tx: active, branchSlug: order.branchSlug };
      }

      const created = await tx.paymentTransaction.create({
        data: {
          tenantId: tenant.id,
          orderDbId: order.id,
          providerId: selectedProviderId,
          status: "INITIATED",
          amountMinor: order.total,
          currency: order.currency,
          currencyExponent,
          nextResyncAt: new Date(Date.now() + 2 * 60 * 1000),
          resyncAttempt: 0,
        },
        select: { id: true, checkoutUrl: true, status: true, providerId: true, externalId: true },
      });

      const bindRes = await bindPaymentCheckoutRequest({
        prisma: tx as unknown as PrismaClient,
        tenantId: tenant.id,
        idempotencyKey,
        requestHash,
        orderDbId: order.id,
        providerId: selectedProviderId,
        transactionId: created.id,
      });

      if (!bindRes.ok) {
        // Conflict: do not keep a useless attempt if another request already bound this key.
        await tx.paymentTransaction.delete({ where: { tenantId_id: { tenantId: tenant.id, id: created.id } } }).catch(() => {});
        return { kind: "IDEMPOTENCY_CONFLICT" as const };
      }

      if (!bindRes.created && bindRes.transactionId !== created.id) {
        // Idempotency HIT on a different transactionId (race). Prefer the existing one and delete ours.
        await tx.paymentTransaction.delete({ where: { tenantId_id: { tenantId: tenant.id, id: created.id } } }).catch(() => {});
        const existing = await tx.paymentTransaction.findUnique({
          where: { tenantId_id: { tenantId: tenant.id, id: bindRes.transactionId } },
          select: { id: true, checkoutUrl: true, status: true, providerId: true, externalId: true },
        });
        if (existing) return { kind: "DONE" as const, tx: existing };
      }

      return { kind: "DONE" as const, tx: created, branchSlug: order.branchSlug };
    });

    if (res.kind === "ORDER_NOT_FOUND") return reply.code(404).send({ error: "Order not found" });
    if (res.kind === "UNSUPPORTED_CURRENCY") {
      return reply.code(422).send({ error: "Unsupported currency", code: "PAYMENTS_UNSUPPORTED_CURRENCY" });
    }
    if (res.kind === "UNSUPPORTED_EXPONENT") {
      return reply.code(422).send({ error: "Unsupported currency exponent", code: "PAYMENTS_UNSUPPORTED_CURRENCY_EXPONENT" });
    }
    if (res.kind === "ACTIVE_PROVIDER_MISMATCH") {
      return reply.code(409).send({ error: "Active attempt exists for a different provider", code: "PAYMENTS_ACTIVE_ATTEMPT_PROVIDER_MISMATCH" });
    }
    if (res.kind === "IDEMPOTENCY_CONFLICT") {
      return reply.code(409).send({ error: "Idempotency conflict", code: "IDEMPOTENCY_CONFLICT" });
    }
    if (res.kind !== "DONE") {
      return reply.code(500).send({ error: "Internal error", code: "PAYMENTS_UNEXPECTED_RESULT" });
    }
    if (!res.branchSlug) {
      return reply.code(500).send({ error: "Internal error", code: "PAYMENTS_ORDER_BRANCH_SLUG_MISSING" });
    }

    const tx = await deps.prisma.paymentTransaction.findUnique({
      where: { tenantId_id: { tenantId: tenant.id, id: res.tx.id } },
      select: {
        id: true,
        orderDbId: true,
        checkoutUrl: true,
        status: true,
        providerId: true,
        externalId: true,
        amountMinor: true,
        currency: true,
        currencyExponent: true,
      },
    });
    if (!tx) return reply.code(500).send({ error: "Internal error", code: "PAYMENTS_TX_MISSING" });

    if (tx.checkoutUrl) {
      return reply.code(200).send({ transactionId: tx.id, checkoutUrl: tx.checkoutUrl, status: tx.status });
    }

    const providerRecord = await deps.prisma.paymentProvider.findUnique({
      where: { id: tx.providerId },
      select: { id: true, type: true, credentialsRef: true, config: true },
    });
    if (!providerRecord) {
      return reply.code(422).send({ error: "Payment provider not available", code: "PAYMENTS_PROVIDER_INVALID" });
    }

    if (providerRecord.type !== "LIQPAY" && providerRecord.type !== "MONOBANK" && providerRecord.type !== "MOLLIE") {
      return reply.code(501).send({
        error: "Provider checkout creation not implemented yet",
        code: "PAYMENTS_PROVIDER_CREATE_NOT_IMPLEMENTED",
        transactionId: tx.id,
      });
    }

    const webBase = (process.env.WEB_BASE_URL || "").trim().replace(/\/$/, "");
    if (!webBase) {
      return reply.code(500).send({ error: "Server misconfigured", code: "PAYMENTS_MISCONFIG_WEB_BASE_URL" });
    }

    const cfg = (providerRecord.config as any) ?? {};
    const webhookTokens: string[] = Array.isArray(cfg.webhookTokens) ? cfg.webhookTokens : [];
    const webhookToken = webhookTokens[0];
    if (!webhookToken) {
      return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_WEBHOOK_TOKEN_MISSING" });
    }

    const resultUrl = `${webBase}/t/${encodeURIComponent(tenant.slug)}/${encodeURIComponent(res.branchSlug)}/order/${encodeURIComponent(body.orderToken)}`;

    if (providerRecord.type === "LIQPAY") {
      const liqpayCfg = cfg.liqpay ?? {};
      const publicKey: string | undefined = typeof liqpayCfg.publicKey === "string" ? liqpayCfg.publicKey : undefined;
      const currentSecretRef: string | undefined =
        typeof liqpayCfg.currentSecretRef === "string" ? liqpayCfg.currentSecretRef : undefined;
      const signatureOutAlgorithm: LiqpaySignatureAlgorithm =
        liqpayCfg.signatureOutAlgorithm === "sha3-256" ? "sha3-256" : "sha1";
      const version: number = Number.isFinite(Number(liqpayCfg.version)) ? Number(liqpayCfg.version) : 3;

      if (!publicKey || !currentSecretRef) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_LIQPAY_CONFIG_MISSING" });
      }

      const privateKey = process.env[currentSecretRef];
      if (!privateKey) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
      }

      const webhookUrl = `${webBase}/api/webhooks/payments/liqpay/${providerRecord.id}?t=${encodeURIComponent(webhookToken)}`;

      const { data, signature } = liqpayCheckoutDataAndSignature({
        version,
        publicKey,
        privateKey,
        signatureAlgorithm: signatureOutAlgorithm,
        transactionId: tx.id,
        amountMinor: tx.amountMinor,
        currency: tx.currency,
        currencyExponent: tx.currencyExponent,
        description: `Payment ${tx.id}`,
        webhookUrl,
        resultUrl,
      });

      const checkoutUrl = `${webBase}/checkout/liqpay?data=${encodeURIComponent(data)}&signature=${encodeURIComponent(signature)}`;

      await deps.prisma.paymentTransaction.updateMany({
        where: {
          tenantId: tenant.id,
          id: tx.id,
          externalId: null,
          status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
        },
        data: {
          externalId: tx.id,
          checkoutUrl,
          status: "PENDING",
          nextResyncAt: new Date(Date.now() + 5 * 60 * 1000),
          resyncAttempt: 0,
        },
      });
    } else if (providerRecord.type === "MOLLIE") {
      const apiKeyRef = providerRecord.credentialsRef;
      if (!apiKeyRef) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_REF_MISSING" });
      }
      const apiKey = process.env[apiKeyRef];
      if (!apiKey) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
      }

      const webhookUrl = `${webBase}/api/webhooks/payments/mollie/${providerRecord.id}?t=${encodeURIComponent(webhookToken)}`;

      let externalId: string;
      let checkoutUrl: string;
      try {
        const created = await mollieCreatePayment({
          apiKey,
          idempotencyKey: tx.id,
          amountMinor: tx.amountMinor,
          currency: tx.currency,
          currencyExponent: tx.currencyExponent,
          description: `Payment ${tx.id}`,
          redirectUrl: resultUrl,
          webhookUrl,
          metadata: { transactionId: tx.id, orderDbId: tx.orderDbId },
          timeoutMs: 4500,
          retries: 1,
          backoffMs: 250,
        });
        externalId = created.id;
        checkoutUrl = created.checkoutUrl;
      } catch {
        return reply.code(500).send({ error: "Provider error", code: "PAYMENTS_PROVIDER_UPSTREAM_ERROR" });
      }

      await deps.prisma.paymentTransaction.updateMany({
        where: {
          tenantId: tenant.id,
          id: tx.id,
          externalId: null,
          status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
        },
        data: {
          externalId,
          checkoutUrl,
          status: "PENDING",
          nextResyncAt: new Date(Date.now() + 5 * 60 * 1000),
          resyncAttempt: 0,
        },
      });
    } else if (providerRecord.type === "MONOBANK") {
      const tokenRef = providerRecord.credentialsRef;
      if (!tokenRef) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_REF_MISSING" });
      }
      const token = process.env[tokenRef];
      if (!token) {
        return reply.code(422).send({ error: "Payment provider not configured", code: "PAYMENTS_PROVIDER_SECRET_MISSING" });
      }

      const webhookUrl = `${webBase}/api/webhooks/payments/monobank/${providerRecord.id}?t=${encodeURIComponent(webhookToken)}`;

      let invoiceId: string;
      let pageUrl: string;
      try {
        const created = await monobankCreateInvoice({
          token,
          amountMinor: tx.amountMinor,
          currencyAlpha: tx.currency,
          transactionId: tx.id,
          webhookUrl,
          redirectUrl: resultUrl,
          timeoutMs: 4500,
          retries: 1,
          backoffMs: 250,
        });
        invoiceId = created.invoiceId;
        pageUrl = created.pageUrl;
      } catch {
        return reply.code(500).send({ error: "Provider error", code: "PAYMENTS_PROVIDER_UPSTREAM_ERROR" });
      }

      await deps.prisma.paymentTransaction.updateMany({
        where: {
          tenantId: tenant.id,
          id: tx.id,
          externalId: null,
          status: { in: ["INITIATED", "PENDING", "PENDING_VERIFICATION"] },
        },
        data: {
          externalId: invoiceId,
          checkoutUrl: pageUrl,
          status: "PENDING",
          nextResyncAt: new Date(Date.now() + 5 * 60 * 1000),
          resyncAttempt: 0,
        },
      });
    }

    const finalTx = await deps.prisma.paymentTransaction.findUnique({
      where: { tenantId_id: { tenantId: tenant.id, id: tx.id } },
      select: { id: true, checkoutUrl: true, status: true },
    });

    if (!finalTx) return reply.code(500).send({ error: "Internal error", code: "PAYMENTS_TX_MISSING" });
    if (!finalTx.checkoutUrl) return reply.code(500).send({ error: "Internal error", code: "PAYMENTS_CHECKOUT_URL_MISSING" });
    return reply.code(200).send({ transactionId: finalTx.id, checkoutUrl: finalTx.checkoutUrl, status: finalTx.status });
  });
}
