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

  // Make computeNextResyncAt jitter deterministic for this smoke.
  const originalRandom = Math.random;
  Math.random = () => 0;

  // Local Mollie mock that always returns 500 -> TRANSIENT error classification.
  const mollieServer = createServer((req, res) => {
    if (req.method === "GET" && (req.url || "").startsWith("/v2/payments/")) {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ status: 500, error: "INTERNAL" }));
      return;
    }
    res.statusCode = 404;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify({ error: "NOT_FOUND" }));
  });

  await new Promise<void>((resolve) => mollieServer.listen(0, "127.0.0.1", () => resolve()));
  const molliePort = (mollieServer.address() as any).port as number;
  const mollieBaseUrl = `http://127.0.0.1:${molliePort}`;

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });
  const paymentsQueue = createPaymentsQueue({ url: redisUrl });
  const workerFactory = new PaymentsWorkerFactory({ connection: { url: redisUrl }, concurrency: 1 });

  const tenantSlug = randId("payments_smoke_tenant");
  const externalId = randId("tr_smoke_mollie");
  const apiKeyEnvName = "MOLLIE_API_KEY_REHEARSAL";

  let tenantId: string | null = null;
  let providerId: string | null = null;
  let paymentEventId: string | null = null;

  try {
    process.env.MOLLIE_API_BASE_URL = mollieBaseUrl;
    process.env[apiKeyEnvName] = "test_mollie_key";

    workerFactory.start({ prisma, secrets: envSecretResolver(), paymentsQueue });

    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantSlug } });
    tenantId = tenant.id;

    const provider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "MOLLIE",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: apiKeyEnvName,
        config: { webhookTokens: [] },
      },
      select: { id: true },
    });
    providerId = provider.id;

    const now = new Date();
    const ev = await prisma.paymentEvent.create({
      data: {
        tenantId,
        providerId,
        externalId,
        payloadHash: crypto.randomBytes(32).toString("hex"),
        dedupKey: crypto.randomBytes(16).toString("hex"),
        status: "UNMATCHED",
        unmatchedAttempt: 0,
        unmatchedNextAttemptAt: now,
        receivedAt: new Date(now.getTime() - 30 * 1000),
      },
      select: { id: true },
    });
    paymentEventId = ev.id;

    await paymentsQueue.enqueueResyncExternal({ tenantId, providerId, externalId });

    const expectedNext = new Date(now.getTime() + 2 * 60 * 1000); // nextAttempt=1 => 2 minutes (jitter forced to 0)
    await waitFor({
      label: "UNMATCHED bumped with transient backoff",
      timeoutMs: 30_000,
      stepMs: 200,
      fn: async () => {
        const row = await prisma.paymentEvent.findUnique({
          where: { id: paymentEventId! },
          select: { status: true, unmatchedAttempt: true, errorCode: true, unmatchedNextAttemptAt: true },
        });
        if (!row) return false;
        if (row.status !== "UNMATCHED") return false;
        if (row.unmatchedAttempt !== 1) return false;
        if (row.errorCode !== "VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE") return false;
        if (!row.unmatchedNextAttemptAt) return false;
        // Allow small drift because DB timestamps may not match exactly
        return Math.abs(row.unmatchedNextAttemptAt.getTime() - expectedNext.getTime()) <= 2000;
      },
    });

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ ok: true, tool: "paymentsLocalSmokeUnmatchedBackoff", tenantId, providerId, paymentEventId }));
  } finally {
    delete process.env.MOLLIE_API_BASE_URL;
    delete process.env[apiKeyEnvName];
    Math.random = originalRandom;

    await paymentsQueue.close().catch(() => {});
    await workerFactory.close().catch(() => {});
    mollieServer.close();

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
