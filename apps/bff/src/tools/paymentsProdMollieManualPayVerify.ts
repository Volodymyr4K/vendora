import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import { setTimeout as delay } from "node:timers/promises";

import { PrismaClient } from "@vendora/database";

import { getBullMqConnectionFromEnv } from "../lib/redis-client.js";
import { createPaymentsQueue } from "../services/payments/payments-queue.js";
import { fetchJsonWithMeta, UpstreamHttpError } from "../services/http.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function envInt(name: string, defaultValue: number): number {
  const raw = (process.env[name] ?? "").trim();
  if (!raw) return defaultValue;
  const n = Number(raw);
  return Number.isFinite(n) ? n : defaultValue;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const v = raw.trim().toLowerCase();
  if (v === "") return defaultValue;
  if (v === "1" || v === "true" || v === "yes" || v === "on") return true;
  if (v === "0" || v === "false" || v === "no" || v === "off") return false;
  return defaultValue;
}

async function mollieGetPaymentStatus(apiKey: string, paymentId: string) {
  try {
    const res = await fetchJsonWithMeta<any>(
      `https://api.mollie.com/v2/payments/${encodeURIComponent(paymentId)}`,
      {
        timeoutMs: 6_000,
        retries: 0,
        backoffMs: 0,
        headers: { authorization: `Bearer ${apiKey}` },
        op: "mollie.payment.get.manual",
      }
    );
    const status = typeof res.json?.status === "string" ? res.json.status : null;
    return { ok: true as const, httpStatus: res.status, status };
  } catch (e: unknown) {
    const up = e instanceof UpstreamHttpError ? e : null;
    return { ok: false as const, httpStatus: up?.status ?? null, status: null };
  }
}

async function waitForOrderPaid(args: { prisma: PrismaClient; tenantId: string; orderDbId: string; timeoutMs: number }) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const order = await args.prisma.order.findUnique({
      where: { tenantId_id: { tenantId: args.tenantId, id: args.orderDbId } },
      select: { id: true, status: true, financialStatus: true, paidAt: true },
    });
    if (order && order.financialStatus === "PAID") return order;
    await delay(400);
  }
  const last = await args.prisma.order.findUnique({
    where: { tenantId_id: { tenantId: args.tenantId, id: args.orderDbId } },
    select: { id: true, status: true, financialStatus: true, paidAt: true },
  });
  throw new Error(`Timed out waiting for Order.financialStatus=PAID (last=${JSON.stringify(last)})`);
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

  const tenantSlug = (process.env.TENANT_SLUG ?? "").trim();
  const allowAnyTenant = envBool("PAYMENTS_MOLLIE_ALLOW_ANY_TENANT", false);

  const mollieKeyEnv = (process.env.PAYMENTS_MOLLIE_API_KEY_ENV ?? "ZZ_MOLLIE_API_KEY_TEST").trim();
  assert(mollieKeyEnv, "PAYMENTS_MOLLIE_API_KEY_ENV empty");
  const mollieApiKey = (process.env[mollieKeyEnv] ?? "").trim();
  assert(mollieApiKey, `Mollie API key missing in environment (${mollieKeyEnv} not set)`);

  const waitSeconds = envInt("PAYMENTS_MOLLIE_WAIT_SECONDS", 240);

  const prisma = new PrismaClient();
  const queue = createPaymentsQueue(conn);

  let providerId: string | null = null;
  let tenantId: string | null = null;

  try {
    const tenant =
      tenantSlug
        ? await prisma.tenant.findUnique({ where: { slug: tenantSlug }, select: { id: true, slug: true } })
        : await prisma.tenant.findFirst({
            where: { slug: { startsWith: "zz_mollie_e2e_" } },
            orderBy: { createdAt: "desc" },
            select: { id: true, slug: true },
          });
    assert(tenant, "Tenant not found");
    if (!allowAnyTenant) {
      assert(tenant.slug.startsWith("zz_mollie_e2e_"), "Refusing: tenantSlug must start with zz_mollie_e2e_ (set PAYMENTS_MOLLIE_ALLOW_ANY_TENANT=true to override)");
    }
    tenantId = tenant.id;

    const provider = await prisma.paymentProvider.findFirst({
      where: { tenantId: tenant.id, type: "MOLLIE", mode: "TEST" },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true },
    });
    assert(provider, "Mollie TEST provider not found for tenant");
    providerId = provider.id;

    // Temporarily enable provider to allow verification jobs.
    await prisma.paymentProvider.updateMany({ where: { tenantId: tenant.id, id: provider.id }, data: { status: "ACTIVE" } });

    const tx = await prisma.paymentTransaction.findFirst({
      where: { tenantId: tenant.id, providerId: provider.id },
      orderBy: { createdAt: "desc" },
      select: { id: true, status: true, externalId: true, checkoutUrl: true, orderDbId: true },
    });
    assert(tx, "No transaction found for tenant/provider");
    assert(tx.externalId, "Transaction externalId missing");

    // Wait until Mollie marks it paid (optional, but default true).
    const waitUntilPaid = envBool("PAYMENTS_MOLLIE_WAIT_UNTIL_PAID", true);
    let mollieStatus: string | null = null;

    if (waitUntilPaid) {
      const deadline = Date.now() + waitSeconds * 1000;
      while (Date.now() < deadline) {
        const res = await mollieGetPaymentStatus(mollieApiKey, tx.externalId);
        mollieStatus = res.ok ? res.status : null;
        if (mollieStatus === "paid") break;
        if (mollieStatus === "failed" || mollieStatus === "expired" || mollieStatus === "canceled") break;
        await delay(1500);
      }
    } else {
      const res = await mollieGetPaymentStatus(mollieApiKey, tx.externalId);
      mollieStatus = res.ok ? res.status : null;
    }

    // Trigger a resync to pull the latest status and update Order.
    await queue.enqueueResyncTransaction({ tenantId: tenant.id, transactionId: tx.id });

    const order = await waitForOrderPaid({ prisma, tenantId: tenant.id, orderDbId: tx.orderDbId, timeoutMs: 60_000 }).catch(() => null);

    // eslint-disable-next-line no-console
    console.log(JSON.stringify({
      ok: true,
      tool: "paymentsProdMollieManualPayVerify",
      tenantSlug: tenant.slug,
      providerId: provider.id,
      transactionId: tx.id,
      mollieExternalId: tx.externalId,
      mollieStatus,
      order,
      note: order?.financialStatus === "PAID" ? "PAID confirmed in DB" : "Not PAID yet (re-run after completing payment)",
    }));
  } finally {
    // Disable provider again for safety.
    if (tenantId && providerId) {
      await prisma.paymentProvider.updateMany({ where: { tenantId, id: providerId }, data: { status: "DISABLED" } }).catch(() => {});
    }
    await queue.close().catch(() => {});
    await prisma.$disconnect().catch(() => {});
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});

