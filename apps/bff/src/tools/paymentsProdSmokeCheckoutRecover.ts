import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@vendora/database";

import { getBullMqConnectionFromEnv } from "../lib/redis-client.js";
import { createPaymentsQueue } from "../services/payments/payments-queue.js";
import { runPaymentsProdSmokePreflight } from "./_paymentsProdSmokePreflightHelper.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function randId(prefix: string) {
  const raw = crypto.randomBytes(10).toString("hex");
  return `${prefix}_${Date.now()}_${raw}`;
}

async function waitForRecoverObserved(args: { prisma: PrismaClient; tenantId: string; transactionId: string; timeoutMs: number }) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const tx = await args.prisma.paymentTransaction.findUnique({
      where: { tenantId_id: { tenantId: args.tenantId, id: args.transactionId } },
      select: {
        id: true,
        status: true,
        externalId: true,
        checkoutUrl: true,
        resyncAttempt: true,
        lastErrorCode: true,
        nextResyncAt: true,
      },
    });
    if (
      tx &&
      tx.status === "INITIATED" &&
      tx.externalId == null &&
      tx.checkoutUrl == null &&
      tx.resyncAttempt >= 1 &&
      tx.lastErrorCode === "PROVIDER_AUTH_FAILED" &&
      tx.nextResyncAt === null
    ) {
      return tx;
    }
    await delay(250);
  }
  const last = await args.prisma.paymentTransaction.findUnique({
    where: { tenantId_id: { tenantId: args.tenantId, id: args.transactionId } },
    select: { id: true, status: true, externalId: true, checkoutUrl: true, resyncAttempt: true, lastErrorCode: true, nextResyncAt: true },
  });
  throw new Error(`Timed out waiting for checkout.recover observation (last=${JSON.stringify(last)})`);
}

async function main() {
  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const conn = getBullMqConnectionFromEnv();
  assert(conn?.url, "Redis/BullMQ not configured");

  await runPaymentsProdSmokePreflight({ redisUrl: conn.url });

  // This smoke expects WEB_BASE_URL to be present in environment (Fly secret).
  const webBase = (process.env.WEB_BASE_URL ?? "").trim();
  assert(webBase, "WEB_BASE_URL missing (expected Fly secret)");

  const prisma = new PrismaClient();
  const paymentsQueue = createPaymentsQueue(conn);

  const tenantSlug = randId("payments_smoke_tenant");
  const branchSlug = randId("payments_smoke_branch");
  const orderToken = randId("payments_smoke_ot");
  const orderId = `ORD-SMOKE-${Date.now()}`;

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let orderDbId: string | null = null;
  let providerId: string | null = null;
  let transactionId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug } });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { tenantId, slug: branchSlug, cityName: "Smoke City", phones: [], zones: [] },
    });
    branchId = branch.id;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { branchesMode: "SINGLE", defaultBranchId: branchId },
    });

    const order = await prisma.order.create({
      data: {
        tenantId,
        token: orderToken,
        orderId,
        branchSlug,
        branchId,
        status: "created",
        total: 1234,
        payload: {},
      },
      select: { id: true },
    });
    orderDbId = order.id;

    // Active LiqPay provider with webhookTokens and minimal liqpay config,
    // but `currentSecretRef` is intentionally missing in environment => no upstream calls, deterministic auth-fail update.
    const provider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "LIQPAY",
        mode: "LIVE",
        status: "ACTIVE",
        config: {
          webhookTokens: ["smoke_webhook_token"],
          liqpay: {
            publicKey: "smoke_pub",
            currentSecretRef: "LIQPAY_SMOKE_MISSING_SECRET",
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
      select: { id: true },
    });
    providerId = provider.id;

    const tx = await prisma.paymentTransaction.create({
      data: {
        tenantId,
        orderDbId,
        providerId,
        externalId: null,
        checkoutUrl: null,
        status: "INITIATED",
        amountMinor: 1234,
        currency: "UAH",
        currencyExponent: 2,
        nextResyncAt: new Date(0),
      },
      select: { id: true },
    });
    transactionId = tx.id;

    await paymentsQueue.enqueueCheckoutRecover({ tenantId, transactionId });

    await waitForRecoverObserved({ prisma, tenantId, transactionId, timeoutMs: 30_000 });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsProdSmokeCheckoutRecover", tenantId, providerId, transactionId }));
  } finally {
    await paymentsQueue.close().catch(() => {});

    if (tenantId) {
      if (transactionId) await prisma.paymentTransaction.deleteMany({ where: { tenantId, id: transactionId } }).catch(() => {});
      if (providerId) await prisma.paymentProvider.deleteMany({ where: { tenantId, id: providerId } }).catch(() => {});
      if (orderDbId) await prisma.order.deleteMany({ where: { tenantId, id: orderDbId } }).catch(() => {});
      if (branchId) await prisma.branch.deleteMany({ where: { tenantId, id: branchId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }

    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
