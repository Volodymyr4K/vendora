/**
 * Phase 4.2: Price/availability from Offer only (PriceSource cutover).
 * getPriceForBranch(variantId, branchId) → only from Offer; otherwise error/unavailable.
 */
import type { PrismaClient } from "@vendora/database";

export type OfferPriceResult = { priceCents: number; isAvailable: boolean; offerId: string };

/**
 * Get price and availability for (variantId, branchId) from Offer only.
 * Throws if no Offer found (no fallback on variant/item).
 */
export async function getPriceForBranch(
  prisma: PrismaClient,
  tenantId: string,
  branchId: string,
  variantId: string
): Promise<OfferPriceResult> {
  const offer = await prisma.offer.findUnique({
    where: {
      tenantId_branchId_variantId: { tenantId, branchId, variantId },
    },
    select: { id: true, priceCents: true, isAvailable: true },
  });
  if (!offer) {
    throw new Error("OFFER_NOT_FOUND");
  }
  return {
    priceCents: offer.priceCents,
    isAvailable: offer.isAvailable,
    offerId: offer.id,
  };
}
