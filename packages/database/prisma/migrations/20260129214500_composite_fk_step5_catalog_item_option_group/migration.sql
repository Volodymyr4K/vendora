-- Composite FK plan step 5: CatalogItemOptionGroup → CatalogItem, OptionGroup (composite FKs)
ALTER TABLE "CatalogItemOptionGroup" DROP CONSTRAINT "CatalogItemOptionGroup_catalogItemId_fkey";
ALTER TABLE "CatalogItemOptionGroup" DROP CONSTRAINT "CatalogItemOptionGroup_optionGroupId_fkey";

ALTER TABLE "CatalogItemOptionGroup" ADD CONSTRAINT "CatalogItemOptionGroup_tenantId_catalogItemId_fkey" FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CatalogItemOptionGroup" ADD CONSTRAINT "CatalogItemOptionGroup_tenantId_optionGroupId_fkey" FOREIGN KEY ("tenantId", "optionGroupId") REFERENCES "OptionGroup"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
