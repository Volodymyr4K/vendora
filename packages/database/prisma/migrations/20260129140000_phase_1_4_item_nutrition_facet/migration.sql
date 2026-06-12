-- Phase 1.4: First facet — ItemNutritionFacet (capability "nutrition")
-- One row per catalog item; tenantId for isolation.

CREATE TABLE "ItemNutritionFacet" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "caloriesKcal" INTEGER,
    "proteinG" INTEGER,
    "fatG" INTEGER,
    "carbsG" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemNutritionFacet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ItemNutritionFacet_catalogItemId_key" ON "ItemNutritionFacet"("catalogItemId");

CREATE INDEX "ItemNutritionFacet_tenantId_idx" ON "ItemNutritionFacet"("tenantId");

CREATE INDEX "ItemNutritionFacet_catalogItemId_idx" ON "ItemNutritionFacet"("catalogItemId");

ALTER TABLE "ItemNutritionFacet" ADD CONSTRAINT "ItemNutritionFacet_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ItemNutritionFacet" ADD CONSTRAINT "ItemNutritionFacet_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
