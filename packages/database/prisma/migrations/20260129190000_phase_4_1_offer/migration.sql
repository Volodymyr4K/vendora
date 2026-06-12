-- Phase 4.1: Offer (BranchListing) — price/availability per branch; one active offer per (tenantId, branchId, variantId)
-- Guardrail: composite FKs so Offer.tenantId must match Branch.tenantId and ItemVariant.tenantId

ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenant_id_key" UNIQUE ("tenantId", "id");

CREATE TABLE "Offer" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "stockPolicy" TEXT,
    "leadTime" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Offer_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Offer_tenantId_branchId_variantId_key" ON "Offer"("tenantId", "branchId", "variantId");
CREATE INDEX "Offer_tenantId_idx" ON "Offer"("tenantId");
CREATE INDEX "Offer_branchId_idx" ON "Offer"("branchId");
CREATE INDEX "Offer_variantId_idx" ON "Offer"("variantId");

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Offer" ADD CONSTRAINT "Offer_branch_tenant_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Offer" ADD CONSTRAINT "Offer_variant_tenant_fkey"
  FOREIGN KEY ("tenantId", "variantId") REFERENCES "ItemVariant"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
