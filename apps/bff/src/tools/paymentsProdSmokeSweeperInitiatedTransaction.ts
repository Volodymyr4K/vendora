import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@vendora/database";

import { resolveRedisUrlFromEnv } from "../lib/redis-client.js";
import { runPaymentsProdSmokePreflight } from "./_paymentsProdSmokePreflightHelper.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function randId(prefix: string) {
  const raw = crypto.randomBytes(10).toString("hex");
  return `${prefix}_${Date.now()}_${raw}`;
}

async function waitFor(args: { fn: () => Promise<boolean>; timeoutMs: number; stepMs: number; label: string }) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    if (await args.fn()) return;
    await delay(args.stepMs);
  }
  throw new Error(`Timed out waiting for: ${args.label}`);
}

async function main() {
  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const redisUrl = resolveRedisUrlFromEnv();
  assert(redisUrl, "Redis not configured (expected REDIS_URL or UPSTASH_* envs)");

  // Ensure the queue has a live consumer before we wait for sweeper-driven processing.
  await runPaymentsProdSmokePreflight({ redisUrl, timeoutMs: 20_000 });

  const prisma = new PrismaClient();

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
      select: { id: true },
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

    // Active LiqPay provider with valid webhookTokens + minimal config,
    // but the referenced secret is intentionally missing on the worker side.
    // This should yield a deterministic auth-fail update without any upstream calls.
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

    const createdAtPast = new Date(Date.now() - 10 * 60 * 1000);
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
        nextResyncAt: new Date(0), // due immediately
        createdAt: createdAtPast,
      },
      select: { id: true },
    });
    transactionId = tx.id;

    // Expectation: payments transaction sweeper enqueues checkout.recover for INITIATED tx older than 2 minutes,
    // and worker updates tx with PROVIDER_AUTH_FAILED + resyncAttempt++ + nextResyncAt=null.
    await waitFor({
      label: "checkout.recover observed via tx update (sweeper-driven)",
      timeoutMs: 180_000,
      stepMs: 500,
      fn: async () => {
        const row = await prisma.paymentTransaction.findUnique({
          where: { tenantId_id: { tenantId: tenantId!, id: transactionId! } },
          select: { status: true, externalId: true, checkoutUrl: true, resyncAttempt: true, lastErrorCode: true, nextResyncAt: true },
        });
        return (
          !!row &&
          row.status === "INITIATED" &&
          row.externalId == null &&
          row.checkoutUrl == null &&
          row.resyncAttempt >= 1 &&
          row.lastErrorCode === "PROVIDER_AUTH_FAILED" &&
          row.nextResyncAt === null
        );
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsProdSmokeSweeperInitiatedTransaction", tenantId, providerId, transactionId }));
  } finally {
    // Cleanup: delete in safe order
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

