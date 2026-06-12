-- Phase 6.2: DeliveryConfigFacet — 1:1 with Branch; optional overlay for delivery/slots
CREATE TABLE "DeliveryConfigFacet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "deliveryFee" INTEGER NOT NULL DEFAULT 0,
    "freeFrom" INTEGER NOT NULL DEFAULT 0,
    "etaMin" INTEGER NOT NULL DEFAULT 30,
    "etaMax" INTEGER NOT NULL DEFAULT 60,
    "zones" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 90,
    "prepTimeMinutes" INTEGER NOT NULL DEFAULT 30,
    "slotCapacity" INTEGER NOT NULL DEFAULT 5,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DeliveryConfigFacet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DeliveryConfigFacet_tenantId_branchId_key" ON "DeliveryConfigFacet"("tenantId", "branchId");
CREATE INDEX "DeliveryConfigFacet_tenantId_idx" ON "DeliveryConfigFacet"("tenantId");

ALTER TABLE "DeliveryConfigFacet" ADD CONSTRAINT "DeliveryConfigFacet_tenantId_fkey"
  FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeliveryConfigFacet" ADD CONSTRAINT "DeliveryConfigFacet_tenantId_branchId_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
