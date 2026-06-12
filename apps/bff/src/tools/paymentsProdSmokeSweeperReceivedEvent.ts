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
  const externalId = randId("payments_smoke_ext");

  let tenantId: string | null = null;
  let providerId: string | null = null;
  let paymentEventId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug } });
    tenantId = tenant.id;

    // Provider is ACTIVE but intentionally missing credentialsRef,
    // so resync.external will not call upstream and will safely bump UNMATCHED with PROVIDER_SECRET_MISSING.
    const provider = await prisma.paymentProvider.create({
      data: { tenantId, type: "MOLLIE", mode: "LIVE", status: "ACTIVE" },
      select: { id: true },
    });
    providerId = provider.id;

    const receivedAtPast = new Date(Date.now() - 3 * 60 * 1000);
    const ev = await prisma.paymentEvent.create({
      data: {
        tenantId,
        providerId,
        externalId,
        payloadHash: crypto.randomBytes(32).toString("hex"),
        dedupKey: randId("payments_smoke_dedup"),
        status: "RECEIVED",
        receivedAt: receivedAtPast,
      },
      select: { id: true },
    });
    paymentEventId = ev.id;

    // Expectation: payments sweeper enqueues webhook.process for RECEIVED events older than 60s,
    // webhook.process marks UNMATCHED and enqueues resync.external, which bumps unmatchedAttempt.
    await waitFor({
      label: "PaymentEvent status=UNMATCHED (via sweeper -> webhook.process)",
      timeoutMs: 120_000,
      stepMs: 500,
      fn: async () => {
        const row = await prisma.paymentEvent.findUnique({
          where: { id: paymentEventId! },
          select: { status: true },
        });
        return row?.status === "UNMATCHED";
      },
    });

    await waitFor({
      label: "UNMATCHED bumped with PROVIDER_SECRET_MISSING (via resync.external)",
      timeoutMs: 120_000,
      stepMs: 500,
      fn: async () => {
        const row = await prisma.paymentEvent.findUnique({
          where: { id: paymentEventId! },
          select: { status: true, unmatchedAttempt: true, errorCode: true, unmatchedNextAttemptAt: true },
        });
        return (
          !!row &&
          row.status === "UNMATCHED" &&
          row.unmatchedAttempt >= 1 &&
          row.errorCode === "PROVIDER_SECRET_MISSING" &&
          row.unmatchedNextAttemptAt === null
        );
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsProdSmokeSweeperReceivedEvent", tenantId, providerId, paymentEventId }));
  } finally {
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

