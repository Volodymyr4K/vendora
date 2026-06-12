-- Phase 3.1 guardrail: OrderLine.tenantId must match Order.tenantId and ItemVariant.tenantId (negative write → error)
-- Use composite unique + FK so cross-tenant (tenantId, orderId)/(tenantId, variantId) insert fails.

ALTER TABLE "Order" ADD CONSTRAINT "Order_tenant_id_key" UNIQUE ("tenantId", "id");
ALTER TABLE "ItemVariant" ADD CONSTRAINT "ItemVariant_tenant_id_key" UNIQUE ("tenantId", "id");

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_order_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variant_tenant_fkey"
  FOREIGN KEY ("tenantId", "variantId") REFERENCES "ItemVariant"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
