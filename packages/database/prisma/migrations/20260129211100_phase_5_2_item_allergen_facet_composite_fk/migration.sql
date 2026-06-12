-- Phase 5.2 guardrail: ItemAllergenFacet → CatalogItem must be composite (tenantId, catalogItemId).
-- Prevents cross-tenant "hang" on catalogItemId if a non-HTTP path omits tenant validation.
-- CatalogItem(tenantId, id) unique already exists from Phase 5.1.

-- Unique on (tenantId, catalogItemId) for composite relation (catalogItemId already unique, this reinforces)
CREATE UNIQUE INDEX IF NOT EXISTS "ItemAllergenFacet_tenantId_catalogItemId_key" ON "ItemAllergenFacet"("tenantId", "catalogItemId");

ALTER TABLE "ItemAllergenFacet" DROP CONSTRAINT IF EXISTS "ItemAllergenFacet_catalogItemId_fkey";

ALTER TABLE "ItemAllergenFacet" ADD CONSTRAINT "ItemAllergenFacet_catalog_item_tenant_fkey"
  FOREIGN KEY ("tenantId", "catalogItemId") REFERENCES "CatalogItem"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
