import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { prisma } from "@vendora/database";
import { randomUUID } from "node:crypto";

const TEST_PREFIX = "payment-db-invariants-test__";
const uniqueSlug = () => `${TEST_PREFIX}${randomUUID()}`;

async function cleanupByPrefix() {
  await prisma.paymentEvent.deleteMany({ where: { tenant: { slug: { startsWith: TEST_PREFIX } } } }).catch(() => {});
  await prisma.paymentCheckoutRequest.deleteMany({ where: { tenant: { slug: { startsWith: TEST_PREFIX } } } }).catch(() => {});
  await prisma.paymentTransaction.deleteMany({ where: { tenant: { slug: { startsWith: TEST_PREFIX } } } }).catch(() => {});
  await prisma.paymentProvider.deleteMany({ where: { tenant: { slug: { startsWith: TEST_PREFIX } } } }).catch(() => {});
  await prisma.order.deleteMany({ where: { tenant: { slug: { startsWith: TEST_PREFIX } } } }).catch(() => {});
  await prisma.branch.deleteMany({ where: { tenant: { slug: { startsWith: TEST_PREFIX } } } }).catch(() => {});
  await prisma.tenant.deleteMany({ where: { slug: { startsWith: TEST_PREFIX } } }).catch(() => {});
}

describe.sequential("Payments DB invariants", () => {
  beforeAll(async () => {
    await cleanupByPrefix();
  });

  afterEach(async () => {
    await cleanupByPrefix();
  });

  it("enforces one active payment attempt per order (partial unique index)", async () => {
    const tenant = await prisma.tenant.create({ data: { slug: uniqueSlug(), name: "Payments DB invariants test" } });

    const branch = await prisma.branch.create({
      data: { tenantId: tenant.id, slug: `b_${randomUUID()}`, cityName: "Test City", phones: [], zones: [] },
    });

    await prisma.tenant.update({
      where: { id: tenant.id },
      data: { branchesMode: "SINGLE", defaultBranchId: branch.id },
    });

    const order = await prisma.order.create({
      data: {
        tenantId: tenant.id,
        token: `ot_${randomUUID()}`,
        orderId: `ORD-TEST-${Date.now()}`,
        branchSlug: branch.slug,
        branchId: branch.id,
        status: "created",
        total: 1234,
        payload: {},
      },
      select: { id: true },
    });

    const provider = await prisma.paymentProvider.create({
      data: { tenantId: tenant.id, type: "MOLLIE", mode: "TEST", status: "ACTIVE", config: { webhookTokens: ["t".repeat(40)] } },
      select: { id: true },
    });

    const t1 = await prisma.paymentTransaction.create({
      data: {
        tenantId: tenant.id,
        orderDbId: order.id,
        providerId: provider.id,
        externalId: null,
        status: "INITIATED",
        amountMinor: 1234,
        currency: "UAH",
        currencyExponent: 2,
      },
      select: { id: true },
    });
    expect(t1.id).toBeTruthy();

    await expect(
      prisma.paymentTransaction.create({
        data: {
          tenantId: tenant.id,
          orderDbId: order.id,
          providerId: provider.id,
          externalId: null,
          status: "PENDING",
          amountMinor: 1234,
          currency: "UAH",
          currencyExponent: 2,
        },
        select: { id: true },
      })
    ).rejects.toMatchObject({ code: "P2002" });

    await prisma.paymentTransaction.update({
      where: { id: t1.id },
      data: { status: "FAILED" },
    });

    const t2 = await prisma.paymentTransaction.create({
      data: {
        tenantId: tenant.id,
        orderDbId: order.id,
        providerId: provider.id,
        externalId: null,
        status: "INITIATED",
        amountMinor: 1234,
        currency: "UAH",
        currencyExponent: 2,
      },
      select: { id: true },
    });
    expect(t2.id).toBeTruthy();
  });
});

