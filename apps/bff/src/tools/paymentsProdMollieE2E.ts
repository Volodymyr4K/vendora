import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import dotenv from "dotenv";

import { PrismaClient } from "@vendora/database";

import { getBullMqConnectionFromEnv } from "../lib/redis-client.js";
import { createPaymentsQueue } from "../services/payments/payments-queue.js";
import { runPaymentsProdSmokePreflight } from "./_paymentsProdSmokePreflightHelper.js";
import { fetchJsonWithMeta, UpstreamHttpError } from "../services/http.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function randId(prefix: string) {
  const raw = crypto.randomBytes(10).toString("hex");
  return `${prefix}_${Date.now()}_${raw}`;
}

function randomToken(len = 40) {
  return crypto.randomBytes(Math.ceil(len / 2)).toString("hex").slice(0, len);
}

async function waitForTx(args: {
  prisma: PrismaClient;
  tenantId: string;
  transactionId: string;
  timeoutMs: number;
  predicate: (tx: any) => boolean;
}) {
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
        nextResyncAt: true,
        lastErrorCode: true,
        lastErrorAt: true,
      },
    });
    if (tx && args.predicate(tx)) return tx;
    await delay(300);
  }
  const last = await args.prisma.paymentTransaction.findUnique({
    where: { tenantId_id: { tenantId: args.tenantId, id: args.transactionId } },
    select: {
      id: true,
      status: true,
      externalId: true,
      checkoutUrl: true,
      resyncAttempt: true,
      nextResyncAt: true,
      lastErrorCode: true,
      lastErrorAt: true,
    },
  });
  throw new Error(`Timed out waiting for tx update (last=${JSON.stringify(last)})`);
}

async function probeMolliePayment(apiKey: string, paymentId: string) {
  const base = "https://api.mollie.com";
  try {
    const res = await fetchJsonWithMeta<any>(
      `${base}/v2/payments/${encodeURIComponent(paymentId)}`,
      {
        timeoutMs: 6_000,
        retries: 0,
        backoffMs: 0,
        headers: { authorization: `Bearer ${apiKey}` },
        op: "mollie.payment.probe",
      }
    );
    return { ok: true as const, status: res.status, paymentStatus: res.json?.status ?? null };
  } catch (e: unknown) {
    const up = e instanceof UpstreamHttpError ? e : null;
    return { ok: false as const, status: up?.status ?? null, code: "FAILED" as const };
  }
}

async function main() {
  const baseEnvPath = (process.env.DOTENV_CONFIG_PATH ?? "").trim();
  if (baseEnvPath) {
    const localEnv = path.join(path.dirname(baseEnvPath), ".env.local");
    if (fs.existsSync(localEnv)) dotenv.config({ path: localEnv, override: true });
  }

  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const conn = getBullMqConnectionFromEnv();
  assert(conn?.url, "Redis/BullMQ not configured");

  await runPaymentsProdSmokePreflight({ redisUrl: conn.url, timeoutMs: 20_000 });

  const mollieKeyEnv = (process.env.PAYMENTS_MOLLIE_API_KEY_ENV ?? "ZZ_MOLLIE_API_KEY_TEST").trim();
  assert(mollieKeyEnv, "PAYMENTS_MOLLIE_API_KEY_ENV empty");

  const mollieApiKey = (process.env[mollieKeyEnv] ?? "").trim();
  assert(mollieApiKey, `Mollie API key missing in current environment (${mollieKeyEnv} not set)`);

  const prisma = new PrismaClient();
  const paymentsQueue = createPaymentsQueue(conn);

  const ids = {
    tenantSlug: randId("zz_mollie_e2e"),
    branchSlug: randId("zz_mollie_branch"),
    orderToken: randId("zz_mollie_ot"),
    orderId: `ORD-MOLLIE-E2E-${Date.now()}`,
    webhookToken: randomToken(48),
    payloadHash: crypto.randomBytes(32).toString("hex"),
    dedupKey: randId("zz_mollie_dedup"),
  };

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let orderDbId: string | null = null;
  let providerId: string | null = null;
  let transactionId: string | null = null;
  let paymentEventId: string | null = null;
  let mollieExternalId: string | null = null;

  try {
    const tenant = await prisma.tenant.create({ data: { slug: ids.tenantSlug, name: ids.tenantSlug } });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: { tenantId, slug: ids.branchSlug, cityName: "Mollie E2E City", phones: [], zones: [] },
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
        total: 5678,
        payload: {},
      },
      select: { id: true },
    });
    orderDbId = order.id;

    const provider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "MOLLIE",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: mollieKeyEnv,
        config: { webhookTokens: [ids.webhookToken] },
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
        amountMinor: 5678,
        currency: "EUR",
        currencyExponent: 2,
      },
      select: { id: true },
    });
    transactionId = tx.id;

    // 1) checkout.recover should create Mollie payment (real upstream) and move tx to PENDING.
    await paymentsQueue.enqueueCheckoutRecover({ tenantId, transactionId });

    const afterRecover = await waitForTx({
      prisma,
      tenantId,
      transactionId,
      timeoutMs: 60_000,
      predicate: (t) => t.status === "PENDING" && typeof t.externalId === "string" && !!t.checkoutUrl,
    });
    mollieExternalId = afterRecover.externalId;

    // 2) resync.transaction should fetch Mollie payment/refunds/chargebacks (real upstream) and keep monotonic state.
    await paymentsQueue.enqueueResyncTransaction({ tenantId, transactionId });

    const afterResync = await waitForTx({
      prisma,
      tenantId,
      transactionId,
      timeoutMs: 60_000,
      predicate: (t) => typeof t.externalId === "string" && t.externalId === mollieExternalId && (t.status === "PENDING" || t.status === "PENDING_VERIFICATION"),
    });

    // 3) Optional: simulate webhook ingress by inserting a RECEIVED event and processing it (still verifies via provider API).
    const ev = await prisma.paymentEvent.create({
      data: {
        tenantId,
        providerId,
        externalId: mollieExternalId!,
        payloadHash: ids.payloadHash,
        dedupKey: ids.dedupKey,
        status: "RECEIVED",
      },
      select: { id: true },
    });
    paymentEventId = ev.id;
    await paymentsQueue.enqueueWebhookProcess({ paymentEventId });

    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline) {
      const got = await prisma.paymentEvent.findUnique({
        where: { id: paymentEventId },
        select: { id: true, status: true, processedAt: true, errorCode: true },
      });
      if (got && (got.status === "PROCESSED" || got.status === "FAILED" || got.status === "UNMATCHED")) {
        break;
      }
      await delay(250);
    }
    const finalEvent = await prisma.paymentEvent.findUnique({
      where: { id: paymentEventId },
      select: { id: true, status: true, processedAt: true, errorCode: true },
    });
    assert(finalEvent?.status === "PROCESSED", `Expected PaymentEvent PROCESSED, got ${finalEvent?.status ?? "missing"} (errorCode=${finalEvent?.errorCode ?? "none"})`);

    const upstreamProbe = mollieExternalId
      ? await probeMolliePayment(mollieApiKey, mollieExternalId)
      : { ok: false as const, code: "NO_EXTERNAL_ID" as const };

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true,
      tool: "paymentsProdMollieE2E",
      tenantSlug: ids.tenantSlug,
      tenantId,
      providerId,
      transactionId,
      mollieExternalId,
      txAfterRecover: afterRecover,
      txAfterResync: afterResync,
      paymentEventId,
      paymentEventFinal: finalEvent,
      upstreamProbe,
      note: "Provider will be DISABLED in finally-block; tenant left for future debugging.",
    }));
  } finally {
    // Safety: disable provider to avoid ongoing external calls from sweepers.
    if (providerId && tenantId) {
      await prisma.paymentProvider.updateMany({ where: { tenantId, id: providerId }, data: { status: "DISABLED" } }).catch(() => {});
    }

    await paymentsQueue.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
