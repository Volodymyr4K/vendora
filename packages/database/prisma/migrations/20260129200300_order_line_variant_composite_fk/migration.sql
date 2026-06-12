-- OrderLine.variantId: replace simple FK with composite (tenantId, variantId) → ItemVariant(tenantId, id).
-- Prevents cross-tenant "hang" on variantId; nullable variantId allows no reference (FK check skipped for NULL).

ALTER TABLE "OrderLine" DROP CONSTRAINT IF EXISTS "OrderLine_variantId_fkey";

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variant_tenant_fkey"
  FOREIGN KEY ("tenantId", "variantId") REFERENCES "ItemVariant"("tenantId", "id") ON DELETE SET NULL ON UPDATE CASCADE;
