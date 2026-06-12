-- Phase 5.2: ItemAllergenFacet (capability "allergens"). One row per catalog item; allergen codes list.

CREATE TABLE "ItemAllergenFacet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "allergenCodes" TEXT[] NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemAllergenFacet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemAllergenFacet_catalogItemId_key" ON "ItemAllergenFacet"("catalogItemId");

CREATE INDEX "ItemAllergenFacet_tenantId_idx" ON "ItemAllergenFacet"("tenantId");

CREATE INDEX "ItemAllergenFacet_catalogItemId_idx" ON "ItemAllergenFacet"("catalogItemId");

ALTER TABLE "ItemAllergenFacet" ADD CONSTRAINT "ItemAllergenFacet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemAllergenFacet" ADD CONSTRAINT "ItemAllergenFacet_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
