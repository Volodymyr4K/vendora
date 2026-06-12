/**
 * Phase 4.2: getPriceForBranch — price/availability from Offer only; throws when no Offer.
 */
import { describe, it, expect, vi } from "vitest";
import { getPriceForBranch } from "../offer-price.js";

describe("offer-price", () => {
  it("getPriceForBranch returns price and isAvailable when Offer exists", async () => {
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({
          id: "offer-1",
          priceCents: 1000,
          isAvailable: true,
        }),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    const result = await getPriceForBranch(
      prisma,
      "tenant-1",
      "branch-1",
      "variant-1"
    );

    expect(result).toEqual({
      priceCents: 1000,
      isAvailable: true,
      offerId: "offer-1",
    });
    expect(prisma.offer.findUnique).toHaveBeenCalledWith({
      where: {
        tenantId_branchId_variantId: {
          tenantId: "tenant-1",
          branchId: "branch-1",
          variantId: "variant-1",
        },
      },
      select: { id: true, priceCents: true, isAvailable: true },
    });
  });

  it("getPriceForBranch throws OFFER_NOT_FOUND when no Offer", async () => {
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
    } as unknown as import("@vendora/database").PrismaClient;

    await expect(
      getPriceForBranch(prisma, "tenant-1", "branch-1", "variant-1")
    ).rejects.toThrow("OFFER_NOT_FOUND");
  });
});
