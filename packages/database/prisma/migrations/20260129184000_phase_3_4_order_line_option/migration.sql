-- Phase 3.4: OrderLineOption — selected options per order line (snapshot; currency from Order)
-- Guardrail: need unique(tenantId, id) on OrderLine and OptionItem for composite FK

ALTER TABLE "OrderLine" ADD CONSTRAINT "OrderLine_tenant_id_key" UNIQUE ("tenantId", "id");
ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_tenant_id_key" UNIQUE ("tenantId", "id");

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

-- Guardrail: OrderLineOption.tenantId must match OrderLine.tenantId and OptionItem.tenantId
ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_orderline_tenant_fkey"
  FOREIGN KEY ("tenantId", "orderLineId") REFERENCES "OrderLine"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "OrderLineOption" ADD CONSTRAINT "OrderLineOption_optionitem_tenant_fkey"
  FOREIGN KEY ("tenantId", "optionItemId") REFERENCES "OptionItem"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
