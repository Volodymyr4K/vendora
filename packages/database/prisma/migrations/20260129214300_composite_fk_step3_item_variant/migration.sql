-- Composite FK plan step 3: ItemVariant → CatalogItem (tenantId, catalogItemId)
ALTER TABLE "ItemVariant" DROP CONSTRAINT "ItemVariant_catalogItemId_fkey";

ALTER TABLE "ItemVariant" ADD CONSTRAINT "ItemVariant_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
