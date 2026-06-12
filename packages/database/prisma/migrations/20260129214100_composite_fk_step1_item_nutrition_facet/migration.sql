-- Composite FK plan step 1: ItemNutritionFacet → CatalogItem (tenantId, catalogItemId)
-- Preflight: use constraint name from existing migrations to avoid "DROP not found" across envs.
CREATE UNIQUE INDEX "ItemNutritionFacet_tenantId_catalogItemId_key" ON "ItemNutritionFacet"("tenantId", "catalogItemId");

ALTER TABLE "ItemNutritionFacet" DROP CONSTRAINT "ItemNutritionFacet_catalogItemId_fkey";

ALTER TABLE "ItemNutritionFacet" ADD CONSTRAINT "ItemNutritionFacet_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
