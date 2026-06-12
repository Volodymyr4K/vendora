import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@vendora/database";
import { Queue } from "bullmq";

import { resolveRedisUrlFromEnv } from "../lib/redis-client.js";
import { runPaymentsProdSmokePreflight } from "./_paymentsProdSmokePreflightHelper.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function randId(prefix: string) {
  const raw = crypto.randomBytes(10).toString("hex");
  return `${prefix}_${Date.now()}_${raw}`;
}

async function waitForPaymentEventStatus(args: {
  prisma: PrismaClient;
  paymentEventId: string;
  desired: Array<"PROCESSED" | "FAILED" | "UNMATCHED">;
  timeoutMs: number;
}) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const ev = await args.prisma.paymentEvent.findUnique({
      where: { id: args.paymentEventId },
      select: { id: true, status: true, processedAt: true, errorCode: true },
    });
    if (ev && args.desired.includes(ev.status as any)) return ev;
    await delay(250);
  }
  const last = await args.prisma.paymentEvent.findUnique({
    where: { id: args.paymentEventId },
    select: { id: true, status: true, processedAt: true, errorCode: true },
  });
  throw new Error(
    `Timed out waiting for PaymentEvent ${args.paymentEventId} to reach ${args.desired.join("|")} (last=${last?.status ?? "missing"})`
  );
}

async function main() {
  // Hard gate: require explicit opt-in on the command line.
  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const redisUrl = resolveRedisUrlFromEnv();
  assert(redisUrl, "Redis not configured (expected REDIS_URL or UPSTASH_* envs)");

  await runPaymentsProdSmokePreflight({ redisUrl });

  const prisma = new PrismaClient();

  const queue = new Queue("vendora-payments", { connection: { url: redisUrl } });

  const ids = {
    tenantSlug: randId("payments_smoke_tenant"),
    branchSlug: randId("payments_smoke_branch"),
    orderToken: randId("payments_smoke_ot"),
    orderId: `ORD-SMOKE-${Date.now()}`,
    externalId: randId("payments_smoke_ext"),
    payloadHash: crypto.randomBytes(32).toString("hex"),
    dedupKey: randId("payments_smoke_dedup"),
  };

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let orderDbId: string | null = null;
  let providerId: string | null = null;
  let transactionId: string | null = null;
  let paymentEventId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({ data: { slug: ids.tenantSlug, name: ids.tenantSlug } });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { tenantId, slug: ids.branchSlug, cityName: "Smoke City", phones: [], zones: [] },
    });
    branchId = branch.id;

    await prisma.tenant.update({
      where: { id: tenantId },
      data: { branchesMode: "SINGLE", defaultBranchId: branchId },
    });

    const order = await prisma.order.create({
      data: {
        tenantId,
        token: ids.orderToken,
        orderId: ids.orderId,
        branchSlug: ids.branchSlug,
        branchId,
        status: "created",
        total: 1234,
        payload: {},
      },
      select: { id: true },
    });
    orderDbId = order.id;

    // Important: we deliberately omit LiqPay config/secrets, so verification does NOT call external APIs
    // and produces a soft `PROVIDER_SECRET_MISSING` result.
    const provider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "LIQPAY",
        mode: "LIVE",
        status: "ACTIVE",
        config: {}, // missing liqpay config => provider secret missing
      },
      select: { id: true },
    });
    providerId = provider.id;

    const tx = await prisma.paymentTransaction.create({
      data: {
        tenantId,
        orderDbId,
        providerId,
        externalId: ids.externalId,
        status: "PENDING",
        amountMinor: 1234,
        currency: "UAH",
        currencyExponent: 2,
      },
      select: { id: true },
    });
    transactionId = tx.id;

    const ev = await prisma.paymentEvent.create({
      data: {
        tenantId,
        providerId,
        externalId: ids.externalId,
        payloadHash: ids.payloadHash,
        dedupKey: ids.dedupKey,
        status: "RECEIVED",
      },
      select: { id: true },
    });
    paymentEventId = ev.id;

    const jobId = `payments:webhook.process:${paymentEventId}`;
    await queue.add(
      "webhook.process",
      { paymentEventId },
      { jobId, removeOnComplete: true, removeOnFail: true, attempts: 1 }
    );

    const finalEv = await waitForPaymentEventStatus({
      prisma,
      paymentEventId,
      desired: ["PROCESSED", "FAILED"],
      timeoutMs: 30_000,
    });

    assert(finalEv.status === "PROCESSED", `Expected PROCESSED, got ${finalEv.status} (errorCode=${finalEv.errorCode ?? "none"})`);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsProdSmokeWebhookProcess", tenantId, providerId, transactionId, paymentEventId }));
  } finally {
    await queue.close().catch(() => {});

    // Cleanup: delete in safe order
    if (tenantId) {
      if (paymentEventId) await prisma.paymentEvent.deleteMany({ where: { tenantId, id: paymentEventId } }).catch(() => {});
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
