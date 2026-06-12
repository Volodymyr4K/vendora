import { describe, expect, it, vi } from "vitest";
import { selectPaymentProviderForCheckout } from "../provider-selection.js";

describe("provider-selection", () => {
  it("returns PROVIDER_NOT_FOUND when providerId is missing in tenant", async () => {
    const prisma = {
      paymentProvider: {
        findFirst: vi.fn().mockResolvedValue(null),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await selectPaymentProviderForCheckout({
      prisma,
      tenantId: "tenant-1",
      mode: "TEST",
      providerId: "prov-1",
    });

    expect(res).toEqual({ ok: false, code: "PROVIDER_NOT_FOUND" });
    expect(prisma.paymentProvider.findFirst).toHaveBeenCalled();
  });

  it("rejects DISABLED provider", async () => {
    const prisma = {
      paymentProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prov-1",
          tenantId: "tenant-1",
          type: "MOLLIE",
          mode: "TEST",
          status: "DISABLED",
          credentialsRef: null,
          config: {},
        }),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await selectPaymentProviderForCheckout({
      prisma,
      tenantId: "tenant-1",
      mode: "TEST",
      providerId: "prov-1",
    });

    expect(res).toEqual({ ok: false, code: "PROVIDER_NOT_ACTIVE" });
  });

  it("rejects mode mismatch", async () => {
    const prisma = {
      paymentProvider: {
        findFirst: vi.fn().mockResolvedValue({
          id: "prov-1",
          tenantId: "tenant-1",
          type: "MONOBANK",
          mode: "LIVE",
          status: "ACTIVE",
          credentialsRef: null,
          config: {},
        }),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await selectPaymentProviderForCheckout({
      prisma,
      tenantId: "tenant-1",
      mode: "TEST",
      providerId: "prov-1",
    });

    expect(res).toEqual({ ok: false, code: "PROVIDER_MODE_MISMATCH" });
  });

  it("selects the only ACTIVE provider when providerId omitted", async () => {
    const prisma = {
      paymentProvider: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "prov-1",
            tenantId: "tenant-1",
            type: "LIQPAY",
            mode: "TEST",
            status: "ACTIVE",
            credentialsRef: "LIQPAY_PRIVATE_KEY",
            config: { webhookTokens: ["t1"] },
          },
        ]),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await selectPaymentProviderForCheckout({
      prisma,
      tenantId: "tenant-1",
      mode: "TEST",
    });

    expect(res.ok).toBe(true);
    if (res.ok) expect(res.provider.id).toBe("prov-1");
  });

  it("returns NO_ACTIVE_PROVIDER_FOR_MODE when none exist", async () => {
    const prisma = {
      paymentProvider: {
        findMany: vi.fn().mockResolvedValue([]),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await selectPaymentProviderForCheckout({
      prisma,
      tenantId: "tenant-1",
      mode: "LIVE",
    });

    expect(res).toEqual({ ok: false, code: "NO_ACTIVE_PROVIDER_FOR_MODE" });
  });

  it("returns MULTIPLE_ACTIVE_PROVIDERS_REQUIRE_PROVIDER_ID when multiple exist", async () => {
    const prisma = {
      paymentProvider: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "prov-1",
            tenantId: "tenant-1",
            type: "MOLLIE",
            mode: "TEST",
            status: "ACTIVE",
            credentialsRef: null,
            config: {},
          },
          {
            id: "prov-2",
            tenantId: "tenant-1",
            type: "MONOBANK",
            mode: "TEST",
            status: "ACTIVE",
            credentialsRef: null,
            config: {},
          },
        ]),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const res = await selectPaymentProviderForCheckout({
      prisma,
      tenantId: "tenant-1",
      mode: "TEST",
    });

    expect(res).toEqual({ ok: false, code: "MULTIPLE_ACTIVE_PROVIDERS_REQUIRE_PROVIDER_ID" });
  });
});

