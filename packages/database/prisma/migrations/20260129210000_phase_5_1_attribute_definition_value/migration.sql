-- Phase 5.1: AttributeDefinition and AttributeValue (custom attributes per item; exactly one value* filled)

CREATE TYPE "AttributeValueType" AS ENUM ('STRING', 'NUMBER', 'BOOL', 'ENUM', 'DATE');

CREATE TABLE "AttributeDefinition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "valueType" "AttributeValueType" NOT NULL,
    "appliesToBaseTypes" TEXT[] NOT NULL DEFAULT '{}',
    "isFilterable" BOOLEAN NOT NULL DEFAULT false,
    "isSearchable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeDefinition_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AttributeDefinition_tenantId_key_key" ON "AttributeDefinition"("tenantId", "key");
CREATE UNIQUE INDEX "AttributeDefinition_tenant_id_key" ON "AttributeDefinition"("tenantId", "id");
CREATE INDEX "AttributeDefinition_tenantId_idx" ON "AttributeDefinition"("tenantId");

ALTER TABLE "AttributeDefinition" ADD CONSTRAINT "AttributeDefinition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "AttributeValue" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "definitionId" TEXT NOT NULL,
    "valueString" TEXT,
    "valueNumber" DOUBLE PRECISION,
    "valueBool" BOOLEAN,
    "valueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AttributeValue_pkey" PRIMARY KEY ("id")
);

-- Exactly one of valueString, valueNumber, valueBool, valueDate must be NOT NULL
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_exactly_one_value"
  CHECK (num_nonnulls("valueString", "valueNumber", "valueBool", "valueDate") = 1);

CREATE UNIQUE INDEX "AttributeValue_tenantId_itemId_definitionId_key" ON "AttributeValue"("tenantId", "itemId", "definitionId");
CREATE INDEX "AttributeValue_tenantId_idx" ON "AttributeValue"("tenantId");
CREATE INDEX "AttributeValue_itemId_idx" ON "AttributeValue"("itemId");
CREATE INDEX "AttributeValue_definitionId_idx" ON "AttributeValue"("definitionId");
CREATE INDEX "AttributeValue_definitionId_valueString_idx" ON "AttributeValue"("definitionId", "valueString");
CREATE INDEX "AttributeValue_definitionId_valueNumber_idx" ON "AttributeValue"("definitionId", "valueNumber");
CREATE INDEX "AttributeValue_definitionId_valueBool_idx" ON "AttributeValue"("definitionId", "valueBool");
CREATE INDEX "AttributeValue_definitionId_valueDate_idx" ON "AttributeValue"("definitionId", "valueDate");

ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AttributeValue" ADD CONSTRAINT "AttributeValue_definitionId_fkey" FOREIGN KEY ("definitionId") REFERENCES "AttributeDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
