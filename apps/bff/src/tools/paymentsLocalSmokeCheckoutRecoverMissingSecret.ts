import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@vendora/database";

import { resolveRedisUrlFromEnv } from "../lib/redis-client.js";
import { PaymentsWorkerFactory } from "../services/payments/payments-worker.js";
import { createPaymentsQueue } from "../services/payments/payments-queue.js";
import { envSecretResolver } from "../services/secrets.js";

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
  const allow = (process.env.PAYMENTS_LOCAL_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_LOCAL_SMOKE_ALLOW=true");

  const dbUrl = (process.env.DATABASE_URL ?? "").trim();
  assert(dbUrl, "DATABASE_URL missing");
  const dbHost = new URL(dbUrl).hostname;
  assert(
    dbHost === "localhost" || dbHost === "127.0.0.1",
    `Refusing to run against non-local DB host (${dbHost}). Point DATABASE_URL to localhost/127.0.0.1.`
  );

  const redisUrl = resolveRedisUrlFromEnv();
  assert(redisUrl, "Redis not configured (set REDIS_URL or UPSTASH_* envs)");

  const originalWebBase = process.env.WEB_BASE_URL;
  if (!process.env.WEB_BASE_URL) process.env.WEB_BASE_URL = "http://localhost:3000";

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const paymentsQueue = createPaymentsQueue({ url: redisUrl });
  const workerFactory = new PaymentsWorkerFactory({ connection: { url: redisUrl }, concurrency: 1 });

  const tenantSlug = randId("payments_smoke_tenant");
  const branchSlug = randId("payments_smoke_branch");
  const orderToken = randId("payments_smoke_ot");
  const orderId = `ORD-SMOKE-${Date.now()}`;
  const webhookToken = "smoke_webhook_token";
  const liqpaySecretRefMissing = "LIQPAY_SMOKE_MISSING_SECRET";

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let orderDbId: string | null = null;
  let providerId: string | null = null;
  let transactionId: string | null = null;

  try {
    // Ensure missing secret is NOT present
    delete process.env[liqpaySecretRefMissing];

    workerFactory.start({ prisma, secrets: envSecretResolver(), paymentsQueue });

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

    const provider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [webhookToken],
          liqpay: {
            publicKey: "smoke_pub",
            currentSecretRef: liqpaySecretRefMissing,
            signatureInAlgorithms: ["sha1"],
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

    await waitFor({
      label: "checkout.recover observes missing secret (auth-fail) and leaves tx INITIATED",
      timeoutMs: 30_000,
      stepMs: 250,
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
    console.log(JSON.stringify({ ok: true, tool: "paymentsLocalSmokeCheckoutRecoverMissingSecret", tenantId, providerId, transactionId }));
  } finally {
    if (originalWebBase == null) delete process.env.WEB_BASE_URL;
    else process.env.WEB_BASE_URL = originalWebBase;

    await paymentsQueue.close().catch(() => {});
    await workerFactory.close().catch(() => {});

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
