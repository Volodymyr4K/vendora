-- Phase 3.1: Order.currency (source of truth) + OrderLine (snapshot at creation)

ALTER TABLE "Order" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'UAH';

CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "sku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "OrderLine_tenantId_idx" ON "OrderLine"("tenantId");
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
