-- Phase 3.2: OrderAdjustment — discounts, delivery_fee, tip (amountCents in Order.currency)

CREATE TABLE "OrderAdjustment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderAdjustment_tenantId_idx" ON "OrderAdjustment"("tenantId");
CREATE INDEX "OrderAdjustment_orderId_idx" ON "OrderAdjustment"("orderId");

ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guardrail: OrderAdjustment.tenantId must match Order.tenantId (negative write → error)
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_order_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
