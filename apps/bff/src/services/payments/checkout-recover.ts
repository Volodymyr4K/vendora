import type { PrismaClient } from "@vendora/database";

import type { SecretResolver } from "../secrets.js";
import { computeNextResyncAt } from "./resync-transaction.js";
import { UpstreamHttpError } from "../http.js";
import { liqpayCheckoutDataAndSignature, type LiqpaySignatureAlgorithm } from "./providers/liqpay.js";
import { mollieCreatePayment } from "./providers/mollie.js";
import { monobankCreateInvoice } from "./providers/monobank.js";

function shouldStopAutomaticRetries(args: { createdAt: Date; nextAttempt: number; now: Date }) {
  if (args.nextAttempt >= 20) return true;
  if (args.createdAt.getTime() < args.now.getTime() - 24 * 60 * 60 * 1000) return true;
  return false;
}

export type CheckoutRecoverResult =
  | { ok: true; code: "NOOP" | "RECOVERED"; reason?: string }
  | {
      ok: false;
      code:
        | "TX_NOT_FOUND"
        | "TX_NOT_RECOVERABLE"
        | "PROVIDER_NOT_ACTIVE"
        | "PROVIDER_SECRET_MISSING"
        | "PROVIDER_WEBHOOK_TOKEN_MISSING"
        | "PROVIDER_LIQPAY_CONFIG_MISSING"
        | "WEB_BASE_URL_MISSING"
        | "UPSTREAM_TRANSIENT"
        | "UPSTREAM_AUTH"
        | "UPSTREAM_BAD_REQUEST"
        | "UPSTREAM_UNPARSABLE"
        | "UNSUPPORTED_PROVIDER";
      reason?: string;
    };

export async function recoverCheckoutForTransaction(args: {
  prisma: PrismaClient;
  secrets: SecretResolver;
  tenantId: string;
  transactionId: string;
  now?: Date | undefined;
}): Promise<CheckoutRecoverResult> {
  const now = args.now ?? new Date();

  const tx = await args.prisma.paymentTransaction.findUnique({
    where: { tenantId_id: { tenantId: args.tenantId, id: args.transactionId } },
    select: {
      id: true,
      tenantId: true,
      orderDbId: true,
      providerId: true,
      externalId: true,
      checkoutUrl: true,
      status: true,
      amountMinor: true,
      currency: true,
      currencyExponent: true,
      resyncAttempt: true,
      createdAt: true,
      order: { select: { id: true, token: true, branchSlug: true, status: true } },
      provider: { select: { id: true, type: true, status: true, credentialsRef: true, config: true } },
    },
  });

  if (!tx) return { ok: false, code: "TX_NOT_FOUND" };
  if (tx.status !== "INITIATED" || tx.externalId != null) return { ok: false, code: "TX_NOT_RECOVERABLE" };
  if (tx.provider.status !== "ACTIVE") return { ok: false, code: "PROVIDER_NOT_ACTIVE" };

  const webBase = (process.env.WEB_BASE_URL || "").trim().replace(/\/$/, "");
  if (!webBase) return { ok: false, code: "WEB_BASE_URL_MISSING" };

  const cfg = (tx.provider.config as any) ?? {};
  const webhookTokens: string[] = Array.isArray(cfg.webhookTokens) ? cfg.webhookTokens : [];
  const webhookToken = webhookTokens[0];
  if (!webhookToken) return { ok: false, code: "PROVIDER_WEBHOOK_TOKEN_MISSING" };

  const tenant = await args.prisma.tenant.findUnique({
    where: { id: tx.tenantId },
    select: { slug: true },
  });
  if (!tenant) return { ok: false, code: "TX_NOT_FOUND" };

  const resultUrl = `${webBase}/t/${encodeURIComponent(tenant.slug)}/${encodeURIComponent(tx.order.branchSlug)}/order/${encodeURIComponent(tx.order.token)}`;

  const nextAttempt = tx.resyncAttempt + 1;
  const stop = shouldStopAutomaticRetries({ createdAt: tx.createdAt, nextAttempt, now });

  if (tx.provider.type === "LIQPAY") {
    const liqpayCfg = cfg.liqpay ?? {};
    const publicKey: string | undefined = typeof liqpayCfg.publicKey === "string" ? liqpayCfg.publicKey : undefined;
    const currentSecretRef: string | undefined =
      typeof liqpayCfg.currentSecretRef === "string" ? liqpayCfg.currentSecretRef : undefined;
    const signatureOutAlgorithm: LiqpaySignatureAlgorithm =
      liqpayCfg.signatureOutAlgorithm === "sha3-256" ? "sha3-256" : "sha1";
    const version: number = Number.isFinite(Number(liqpayCfg.version)) ? Number(liqpayCfg.version) : 3;

    if (!publicKey || !currentSecretRef) return { ok: false, code: "PROVIDER_LIQPAY_CONFIG_MISSING" };

    const privateKey = args.secrets.resolve(currentSecretRef);
    if (!privateKey) {
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: { lastErrorCode: "PROVIDER_AUTH_FAILED", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    const webhookUrl = `${webBase}/api/webhooks/payments/liqpay/${tx.provider.id}?t=${encodeURIComponent(webhookToken)}`;
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

    const updated = await args.prisma.paymentTransaction.updateMany({
      where: { tenantId: tx.tenantId, id: tx.id, externalId: null, status: "INITIATED" },
      data: { externalId: tx.id, checkoutUrl, status: "PENDING", nextResyncAt: new Date(now.getTime() + 5 * 60 * 1000), resyncAttempt: 0 },
    });
    if (updated.count !== 1) return { ok: true, code: "NOOP", reason: "CAS_MISS" };
    return { ok: true, code: "RECOVERED" };
  }

  if (tx.provider.type === "MOLLIE") {
    const apiKeyRef = tx.provider.credentialsRef;
    const apiKey = apiKeyRef ? args.secrets.resolve(apiKeyRef) : undefined;
    if (!apiKey) {
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: { lastErrorCode: "PROVIDER_AUTH_FAILED", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    const webhookUrl = `${webBase}/api/webhooks/payments/mollie/${tx.provider.id}?t=${encodeURIComponent(webhookToken)}`;
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

      const updated = await args.prisma.paymentTransaction.updateMany({
        where: { tenantId: tx.tenantId, id: tx.id, externalId: null, status: "INITIATED" },
        data: { externalId: created.id, checkoutUrl: created.checkoutUrl, status: "PENDING", nextResyncAt: new Date(now.getTime() + 5 * 60 * 1000), resyncAttempt: 0 },
      });
      if (updated.count !== 1) return { ok: true, code: "NOOP", reason: "CAS_MISS" };
      return { ok: true, code: "RECOVERED" };
    } catch (e: unknown) {
      const up = e instanceof UpstreamHttpError ? e : null;
      const status = up?.status ?? null;
      const isAuth = status === 401 || status === 403;
      const isBadRequest = typeof status === "number" && status >= 400 && status < 500 && !isAuth && status !== 404 && status !== 429;
      const isTransient = up?.isTimeout || status === null || status === 429 || (typeof status === "number" && status >= 500);
      const isUnparsable =
        String((e as any)?.message || "").toLowerCase().includes("json parse") ||
        String((e as any)?.message || "").toLowerCase().includes("unexpected response shape");

      if (isTransient || isUnparsable) {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: "INITIATED",
            lastErrorCode: isUnparsable ? "PROVIDER_RESPONSE_UNPARSABLE" : "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: isUnparsable ? "UPSTREAM_UNPARSABLE" : "UPSTREAM_TRANSIENT" };
      }

      if (isAuth) {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: { lastErrorCode: "PROVIDER_AUTH_FAILED", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
        });
        return { ok: false, code: "UPSTREAM_AUTH" };
      }

      if (isBadRequest) {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: { lastErrorCode: "PROVIDER_BAD_REQUEST", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
        });
        return { ok: false, code: "UPSTREAM_BAD_REQUEST" };
      }

      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: { lastErrorCode: "PROCESSING_UNEXPECTED_ERROR", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
      });
      return { ok: false, code: "UPSTREAM_TRANSIENT", reason: "UNCLASSIFIED" };
    }
  }

  if (tx.provider.type === "MONOBANK") {
    const tokenRef = tx.provider.credentialsRef;
    const token = tokenRef ? args.secrets.resolve(tokenRef) : undefined;
    if (!token) {
      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: { lastErrorCode: "PROVIDER_AUTH_FAILED", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
      });
      return { ok: false, code: "PROVIDER_SECRET_MISSING" };
    }

    const webhookUrl = `${webBase}/api/webhooks/payments/monobank/${tx.provider.id}?t=${encodeURIComponent(webhookToken)}`;
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

      const updated = await args.prisma.paymentTransaction.updateMany({
        where: { tenantId: tx.tenantId, id: tx.id, externalId: null, status: "INITIATED" },
        data: { externalId: created.invoiceId, checkoutUrl: created.pageUrl, status: "PENDING", nextResyncAt: new Date(now.getTime() + 5 * 60 * 1000), resyncAttempt: 0 },
      });
      if (updated.count !== 1) return { ok: true, code: "NOOP", reason: "CAS_MISS" };
      return { ok: true, code: "RECOVERED" };
    } catch (e: any) {
      const isAuth = e?.status === 401 || e?.status === 403;
      const isBadRequest = typeof e?.status === "number" && e.status >= 400 && e.status < 500 && !isAuth && e.status !== 404 && e.status !== 429;
      const isTransient = e?.isTimeout || e?.status === null || e?.status === 429 || (typeof e?.status === "number" && e.status >= 500);
      const isUnparsable = String(e?.message || "").toLowerCase().includes("json parse");

      if (isTransient || isUnparsable) {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: {
            status: "INITIATED",
            lastErrorCode: isUnparsable ? "PROVIDER_RESPONSE_UNPARSABLE" : "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE",
            lastErrorAt: now,
            resyncAttempt: nextAttempt,
            nextResyncAt: stop ? null : computeNextResyncAt({ now, nextAttempt }),
          },
        });
        return { ok: false, code: isUnparsable ? "UPSTREAM_UNPARSABLE" : "UPSTREAM_TRANSIENT" };
      }

      if (isAuth) {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: { lastErrorCode: "PROVIDER_AUTH_FAILED", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
        });
        return { ok: false, code: "UPSTREAM_AUTH" };
      }

      if (isBadRequest) {
        await args.prisma.paymentTransaction.update({
          where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
          data: { lastErrorCode: "PROVIDER_BAD_REQUEST", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
        });
        return { ok: false, code: "UPSTREAM_BAD_REQUEST" };
      }

      await args.prisma.paymentTransaction.update({
        where: { tenantId_id: { tenantId: tx.tenantId, id: tx.id } },
        data: { lastErrorCode: "PROCESSING_UNEXPECTED_ERROR", lastErrorAt: now, resyncAttempt: nextAttempt, nextResyncAt: null },
      });
      return { ok: false, code: "UPSTREAM_TRANSIENT", reason: "UNCLASSIFIED" };
    }
  }

  return { ok: false, code: "UNSUPPORTED_PROVIDER", reason: String(tx.provider.type) };
}
