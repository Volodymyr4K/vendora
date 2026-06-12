import crypto from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@vendora/database";

import { createPaymentsQueue } from "../services/payments/payments-queue.js";
import { PaymentsWorkerFactory } from "../services/payments/payments-worker.js";
import { envSecretResolver } from "../services/secrets.js";
import { resolveRedisUrlFromEnv } from "../lib/redis-client.js";
import { register } from "../lib/metrics.js";

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
  // Safety: only run when explicitly allowed
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

  register.resetMetrics();

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const paymentsQueue = createPaymentsQueue({ url: redisUrl });
  const workerFactory = new PaymentsWorkerFactory({ connection: { url: redisUrl }, concurrency: 1 });

  const tenantSlug = randId("payments_smoke_tenant");
  const externalId = randId("payments_smoke_ext");

  let tenantId: string | null = null;
  let providerId: string | null = null;
  let paymentEventId: string | null = null;

  try {
    workerFactory.start({ prisma, secrets: envSecretResolver(), paymentsQueue });

    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug } });
    tenantId = tenant.id;

    // Provider is ACTIVE but intentionally missing credentialsRef so resync.external will bump UNMATCHED safely.
    const provider = await prisma.paymentProvider.create({
      data: { tenantId, type: "MOLLIE", mode: "TEST", status: "ACTIVE", credentialsRef: null, config: { webhookTokens: [] } },
      select: { id: true },
    });
    providerId = provider.id;

    const ev = await prisma.paymentEvent.create({
      data: {
        tenantId,
        providerId,
        externalId,
        payloadHash: crypto.randomBytes(32).toString("hex"),
        dedupKey: crypto.randomBytes(16).toString("hex"),
        status: "RECEIVED",
      },
      select: { id: true },
    });
    paymentEventId = ev.id;

    await paymentsQueue.enqueueWebhookProcess({ paymentEventId });

    // webhook.process -> UNMATCHED
    await waitFor({
      label: "PaymentEvent status=UNMATCHED",
      timeoutMs: 20_000,
      stepMs: 200,
      fn: async () => {
        const row = await prisma.paymentEvent.findUnique({
          where: { id: paymentEventId! },
          select: { status: true },
        });
        return row?.status === "UNMATCHED";
      },
    });

    // resync.external -> bump unmatchedAttempt and set errorCode (missing secret)
    await waitFor({
      label: "UNMATCHED bumped with PROVIDER_SECRET_MISSING",
      timeoutMs: 45_000,
      stepMs: 250,
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

    // Minimal metrics sanity
    const m = await register.getMetricsAsJSON();
    const hasUnmatchedProcess = m.some((x: any) =>
      x.name === "payments_webhook_process_total" &&
      ((x.metrics ?? x.values ?? []) as any[]).some((r: any) => r?.labels?.result === "unmatched" && Number(r?.value ?? 0) >= 1)
    );
    assert(hasUnmatchedProcess, "Expected payments_webhook_process_total{result=unmatched} >= 1");

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsLocalSmokeUnmatched", tenantId, providerId, paymentEventId }));
  } finally {
    await paymentsQueue.close().catch(() => {});
    await workerFactory.close().catch(() => {});

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
