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

async function waitForUnmatched(args: { prisma: PrismaClient; paymentEventId: string; timeoutMs: number }) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const ev = await args.prisma.paymentEvent.findUnique({
      where: { id: args.paymentEventId },
      select: { id: true, status: true },
    });
    if (ev?.status === "UNMATCHED") return;
    await delay(200);
  }
  throw new Error(`Timed out waiting for PaymentEvent ${args.paymentEventId} to become UNMATCHED`);
}

async function waitForUnmatchedBumped(args: { prisma: PrismaClient; paymentEventId: string; timeoutMs: number }) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const ev = await args.prisma.paymentEvent.findUnique({
      where: { id: args.paymentEventId },
      select: { id: true, status: true, unmatchedAttempt: true, errorCode: true, unmatchedNextAttemptAt: true },
    });
    if (
      ev &&
      ev.status === "UNMATCHED" &&
      ev.unmatchedAttempt >= 1 &&
      ev.errorCode === "PROVIDER_SECRET_MISSING" &&
      ev.unmatchedNextAttemptAt === null
    ) {
      return ev;
    }
    await delay(250);
  }
  const last = await args.prisma.paymentEvent.findUnique({
    where: { id: args.paymentEventId },
    select: { id: true, status: true, unmatchedAttempt: true, errorCode: true, unmatchedNextAttemptAt: true },
  });
  throw new Error(
    `Timed out waiting for UNMATCHED bump for PaymentEvent ${args.paymentEventId} (last=${JSON.stringify(last)})`
  );
}

async function main() {
  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const redisUrl = resolveRedisUrlFromEnv();
  assert(redisUrl, "Redis not configured (expected REDIS_URL or UPSTASH_* envs)");

  await runPaymentsProdSmokePreflight({ redisUrl });

  const prisma = new PrismaClient();
  const queue = new Queue("vendora-payments", { connection: { url: redisUrl } });

  const tenantSlug = randId("payments_smoke_tenant");
  const externalId = randId("payments_smoke_ext");

  let tenantId: string | null = null;
  let providerId: string | null = null;
  let paymentEventId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug } });
    tenantId = tenant.id;

    // Provider is ACTIVE but intentionally missing credentialsRef, so resync.external does NOT call upstream APIs.
    const provider = await prisma.paymentProvider.create({
      data: { tenantId, type: "MOLLIE", mode: "LIVE", status: "ACTIVE" },
      select: { id: true },
    });
    providerId = provider.id;

    const ev = await prisma.paymentEvent.create({
      data: {
        tenantId,
        providerId,
        externalId,
        payloadHash: crypto.randomBytes(32).toString("hex"),
        dedupKey: randId("payments_smoke_dedup"),
        status: "RECEIVED",
      },
      select: { id: true },
    });
    paymentEventId = ev.id;

    // 1) enqueue webhook.process => should mark UNMATCHED and enqueue resync.external
    await queue.add(
      "webhook.process",
      { paymentEventId },
      { jobId: `payments:webhook.process:${paymentEventId}`, removeOnComplete: true, removeOnFail: true, attempts: 1 }
    );

    await waitForUnmatched({ prisma, paymentEventId, timeoutMs: 20_000 });

    const startedAt = Date.now();
    // 2) wait for resync.external to bump unmatchedAttempt and errorCode
    await waitForUnmatchedBumped({ prisma, paymentEventId, timeoutMs: 150_000 });
    const elapsedMs = Date.now() - startedAt;

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsProdSmokeUnmatchedResyncExternal", tenantId, providerId, paymentEventId, elapsedMs }));
  } finally {
    await queue.close().catch(() => {});

    // Cleanup: delete in safe order
    if (tenantId) {
      if (paymentEventId) await prisma.paymentEvent.deleteMany({ where: { tenantId, id: paymentEventId } }).catch(() => {});
      if (providerId) await prisma.paymentProvider.deleteMany({ where: { tenantId, id: providerId } }).catch(() => {});
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
