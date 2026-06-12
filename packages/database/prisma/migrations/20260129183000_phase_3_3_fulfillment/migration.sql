-- Phase 3.3: Fulfillment — 1:1 with Order (delivery | pickup | booking, address, slot, status)

CREATE TABLE "Fulfillment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "address" TEXT,
    "requestedTime" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "fulfilledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Fulfillment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Fulfillment_orderId_key" ON "Fulfillment"("orderId");
CREATE INDEX "Fulfillment_tenantId_idx" ON "Fulfillment"("tenantId");
CREATE INDEX "Fulfillment_orderId_idx" ON "Fulfillment"("orderId");

ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Guardrail: Fulfillment.tenantId must match Order.tenantId (negative write → error)
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_order_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
