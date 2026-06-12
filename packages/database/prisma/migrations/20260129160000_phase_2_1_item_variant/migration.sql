-- Phase 2.1: ItemVariant — one default variant per item (partial unique index)

CREATE TABLE "ItemVariant" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "priceDeltaCents" INTEGER,
    "isAvailable" BOOLEAN NOT NULL DEFAULT true,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "attributes" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemVariant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemVariant_tenantId_sku_key" ON "ItemVariant"("tenantId", "sku");

CREATE INDEX "ItemVariant_tenantId_idx" ON "ItemVariant"("tenantId");

CREATE INDEX "ItemVariant_catalogItemId_idx" ON "ItemVariant"("catalogItemId");

-- At most one default variant per (tenantId, catalogItemId)
CREATE UNIQUE INDEX "ItemVariant_one_default_per_item" ON "ItemVariant"("tenantId", "catalogItemId") WHERE "isDefault" = true;

ALTER TABLE "ItemVariant" ADD CONSTRAINT "ItemVariant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemVariant" ADD CONSTRAINT "ItemVariant_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
