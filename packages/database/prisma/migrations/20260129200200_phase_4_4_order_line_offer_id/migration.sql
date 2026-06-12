-- Phase 4.4: Drop order contour and recreate with OrderLine.offerId NOT NULL, variantId nullable.
-- Canonical reference for price/availability/reports is offerId; variantId snapshot-only, do not read in business logic.

-- 1. Drop in reverse dependency order (child tables first)
DROP TABLE IF EXISTS "OrderLineOption";
DROP TABLE IF EXISTS "OrderLine";
DROP TABLE IF EXISTS "OrderAdjustment";
DROP TABLE IF EXISTS "Fulfillment";
DROP TABLE IF EXISTS "Order";

-- 2. Create Order with branchId NOT NULL and composite FK to Branch (tenant-scoped)
CREATE TABLE "Order" (
    "id" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branchSlug" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "total" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'UAH',
    "personCount" INTEGER NOT NULL DEFAULT 1,
    "comment" TEXT,
    "requestedDeliveryTime" TIMESTAMP(3),
    "fireAt" TIMESTAMP(3),
    "payload" JSONB NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT,
    "idempotencyKey" TEXT,
    "idempotencyScope" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Order_token_key" ON "Order"("token");
CREATE UNIQUE INDEX "Order_orderId_tenantId_key" ON "Order"("orderId", "tenantId");
CREATE UNIQUE INDEX "Order_tenantId_token_key" ON "Order"("tenantId", "token");
CREATE UNIQUE INDEX "Order_tenant_id_key" ON "Order"("tenantId", "id");
CREATE UNIQUE INDEX "Order_tenantId_idempotencyScope_idempotencyKey_key" ON "Order"("tenantId", "idempotencyScope", "idempotencyKey");
CREATE INDEX "Order_tenantId_idx" ON "Order"("tenantId");
CREATE INDEX "Order_tenantId_branchSlug_createdAt_idx" ON "Order"("tenantId", "branchSlug", "createdAt" DESC);
CREATE INDEX "Order_tenantId_branchId_createdAt_idx" ON "Order"("tenantId", "branchId", "createdAt" DESC);
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Order" ADD CONSTRAINT "Order_branch_tenant_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 3. OrderLine (Phase 4.4: offerId NOT NULL, variantId nullable; composite FK to Offer)
CREATE TABLE "OrderLine" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "offerId" TEXT NOT NULL,
    "variantId" TEXT,
    "qty" INTEGER NOT NULL,
    "priceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "itemTitle" TEXT NOT NULL,
    "sku" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLine_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderLine_tenant_id_key" ON "OrderLine"("tenantId", "id");
CREATE INDEX "OrderLine_tenantId_idx" ON "OrderLine"("tenantId");
CREATE INDEX "OrderLine_orderId_idx" ON "OrderLine"("orderId");
CREATE INDEX "OrderLine_offerId_idx" ON "OrderLine"("offerId");

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_offerId_fkey" FOREIGN KEY ("offerId") REFERENCES "Offer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_order_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_offer_tenant_fkey"
  FOREIGN KEY ("tenantId", "offerId") REFERENCES "Offer"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ItemVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 4. OrderAdjustment (Phase 3.2)
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
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_order_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 5. Fulfillment (Phase 3.3)
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
ALTER TABLE "Fulfillment" ADD CONSTRAINT "Fulfillment_order_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderId") REFERENCES "Order"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 6. OrderLineOption (Phase 3.4)
CREATE TABLE "OrderLineOption" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "orderLineId" TEXT NOT NULL,
    "optionItemId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL DEFAULT 1,
    "priceDeltaCents" INTEGER NOT NULL,
    "optionItemTitleSnapshot" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OrderLineOption_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OrderLineOption_orderLineId_optionItemId_key" ON "OrderLineOption"("orderLineId", "optionItemId");
CREATE INDEX "OrderLineOption_tenantId_idx" ON "OrderLineOption"("tenantId");
CREATE INDEX "OrderLineOption_orderLineId_idx" ON "OrderLineOption"("orderLineId");
CREATE INDEX "OrderLineOption_optionItemId_idx" ON "OrderLineOption"("optionItemId");

ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "OrderLine"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_optionItemId_fkey" FOREIGN KEY ("optionItemId") REFERENCES "OptionItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_orderline_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderLineId") REFERENCES "OrderLine"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_optionitem_tenant_fkey"
  FOREIGN KEY ("tenantId", "optionItemId") REFERENCES "OptionItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
