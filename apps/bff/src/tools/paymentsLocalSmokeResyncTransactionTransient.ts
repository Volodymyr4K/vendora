import crypto from "node:crypto";
import { createServer } from "node:http";
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

  // Local Mollie mock that returns 500 for all requests to force transient classification.
  const mollieServer = createServer((req, res) => {
    res.statusCode = 500;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ status: 500, error: "INTERNAL" }));
  });
  await new Promise<void>((resolve) => mollieServer.listen(0, "127.0.0.1", () => resolve()));
  const molliePort = (mollieServer.address() as any).port as number;
  const mollieBaseUrl = `http://127.0.0.1:${molliePort}`;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const paymentsQueue = createPaymentsQueue({ url: redisUrl });
  const workerFactory = new PaymentsWorkerFactory({ connection: { url: redisUrl }, concurrency: 1 });

  const tenantSlug = randId("payments_smoke_tenant");
  const branchSlug = randId("payments_smoke_branch");
  const orderToken = randId("payments_smoke_ot");
  const orderId = `ORD-SMOKE-${Date.now()}`;
  const apiKeyRef = "MOLLIE_API_KEY_REHEARSAL";

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let orderDbId: string | null = null;
  let providerId: string | null = null;
  let transactionId: string | null = null;

  const originalBaseUrl = process.env.MOLLIE_API_BASE_URL;
  const originalNodeEnv = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = "development";
    process.env.MOLLIE_API_BASE_URL = mollieBaseUrl;
    process.env[apiKeyRef] = "test_mollie_key";

    workerFactory.start({ prisma, secrets: envSecretResolver(), paymentsQueue });

    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug } });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { tenantId, slug: branchSlug, cityName: "Smoke City", phones: [], zones: [] },
      select: { id: true },
    });
    branchId = branch.id;

    await prisma.tenant.update({ where: { id: tenantId }, data: { branchesMode: "SINGLE", defaultBranchId: branchId } });

    const order = await prisma.order.create({
      data: {
        tenantId,
        token: orderToken,
        orderId,
        branchSlug,
        branchId,
        status: "created",
        total: 1234,
        currency: "UAH",
        payload: {},
      },
      select: { id: true },
    });
    orderDbId = order.id;

    const provider = await prisma.paymentProvider.create({
      data: { tenantId, type: "MOLLIE", mode: "TEST", status: "ACTIVE", credentialsRef: apiKeyRef, config: { webhookTokens: [] } },
      select: { id: true },
    });
    providerId = provider.id;

    const tx = await prisma.paymentTransaction.create({
      data: {
        tenantId,
        orderDbId,
        providerId,
        externalId: "tr_smoke_transient",
        checkoutUrl: "https://mollie.local/checkout/tr_smoke_transient",
        status: "PENDING",
        amountMinor: 1234,
        currency: "UAH",
        currencyExponent: 2,
        nextResyncAt: new Date(0),
        resyncAttempt: 0,
      },
      select: { id: true },
    });
    transactionId = tx.id;

    const startedAt = Date.now();
    await paymentsQueue.enqueueResyncTransaction({ tenantId, transactionId });

    await waitFor({
      label: "tx updated with transient provider error + backoff nextResyncAt",
      timeoutMs: 30_000,
      stepMs: 250,
      fn: async () => {
        const row = await prisma.paymentTransaction.findUnique({
          where: { tenantId_id: { tenantId: tenantId!, id: transactionId! } },
          select: { status: true, resyncAttempt: true, nextResyncAt: true, lastErrorCode: true, lastErrorAt: true },
        });
        if (!row) return false;
        if (row.status !== "PENDING_VERIFICATION") return false;
        if (row.resyncAttempt < 1) return false;
        if (row.lastErrorCode !== "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE") return false;
        if (!row.lastErrorAt) return false;
        if (!row.nextResyncAt) return false;
        // Should be in the future, but not too far (cap/jitter handled by computeNextResyncAt).
        const dt = row.nextResyncAt.getTime() - startedAt;
        return dt > 30_000 && dt < 10 * 60 * 1000;
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsLocalSmokeResyncTransactionTransient", tenantId, providerId, transactionId }));
  } finally {
    if (originalBaseUrl == null) delete process.env.MOLLIE_API_BASE_URL;
    else process.env.MOLLIE_API_BASE_URL = originalBaseUrl;
    if (originalNodeEnv == null) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = originalNodeEnv;
    delete process.env[apiKeyRef];

    await paymentsQueue.close().catch(() => {});
    await workerFactory.close().catch(() => {});
    mollieServer.close();

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
