/*
  Warnings:

  - Made the column `tenantId` on table `CustomerAddress` required. This step will fail if there are existing NULL values in that column.

*/
-- Backfill any remaining NULLs (safety net)
UPDATE "CustomerAddress" ca
SET "tenantId" = c."tenantId"
FROM "Customer" c
WHERE ca."customerId" = c."id" AND ca."tenantId" IS NULL;

-- AlterTable: Enforce NOT NULL
ALTER TABLE "CustomerAddress" ALTER COLUMN "tenantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "CustomerAddress" ADD CONSTRAINT "CustomerAddress_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- DropIndex: Remove legacy customerId-only index
DROP INDEX IF EXISTS "CustomerAddress_customerId_idx";
