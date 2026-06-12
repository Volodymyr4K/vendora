-- AlterTable
ALTER TABLE "CustomerAddress" ADD COLUMN     "tenantId" TEXT;

-- Backfill tenantId from Customer
UPDATE "CustomerAddress" ca
SET "tenantId" = c."tenantId"
FROM "Customer" c
WHERE ca."customerId" = c."id";

-- CreateIndex
CREATE INDEX "CustomerAddress_tenantId_customerId_idx" ON "CustomerAddress"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CustomerAddress_tenantId_customerId_createdAt_idx" ON "CustomerAddress"("tenantId", "customerId", "createdAt" DESC);
