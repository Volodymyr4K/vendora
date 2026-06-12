-- Phase 5.1 guardrail: AttributeValue → CatalogItem and AttributeDefinition must be composite (tenantId, id).
-- Prevents cross-tenant "hang" on itemId/definitionId if a non-HTTP path omits tenant validation.

-- 1. CatalogItem: add unique (tenantId, id) for composite FK target
CREATE UNIQUE INDEX IF NOT EXISTS "CatalogItem_tenant_id_key" ON "CatalogItem"("tenantId", "id");

-- 2. AttributeValue: replace simple FKs with composite FKs
ALTER TABLE "AttributeValue" DROP CONSTRAINT IF EXISTS "AttributeValue_itemId_fkey";
ALTER TABLE "AttributeValue" DROP CONSTRAINT IF EXISTS "AttributeValue_definitionId_fkey";

ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_catalog_item_tenant_fkey"
  FOREIGN KEY ("tenantId", "itemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_definition_tenant_fkey"
  FOREIGN KEY ("tenantId", "definitionId") REFERENCES "AttributeDefinition"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
