-- Canonical isolator: Branch drop slug-only index, CustomerFavorite add tenantId

-- DropBranchSlugIndex
DROP INDEX IF EXISTS "Branch_slug_idx";

-- AlterTable CustomerFavorite: add tenantId (nullable)
ALTER TABLE "CustomerFavorite" ADD COLUMN "tenantId" TEXT;

-- Backfill tenantId from Customer
UPDATE "CustomerFavorite" SET "tenantId" = (SELECT "tenantId" FROM "Customer" WHERE "Customer"."id" = "CustomerFavorite"."customerId");

-- Make tenantId NOT NULL
ALTER TABLE "CustomerFavorite" ALTER COLUMN "tenantId" SET NOT NULL;

-- AddForeignKey
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Drop old unique and index
DROP INDEX IF EXISTS "CustomerFavorite_customerId_productId_key";
DROP INDEX IF EXISTS "CustomerFavorite_customerId_idx";

-- Create new unique and indexes
CREATE UNIQUE INDEX "CustomerFavorite_tenantId_customerId_productId_key" ON "CustomerFavorite"("tenantId", "customerId", "productId");
CREATE INDEX "CustomerFavorite_tenantId_idx" ON "CustomerFavorite"("tenantId");
CREATE INDEX "CustomerFavorite_tenantId_customerId_idx" ON "CustomerFavorite"("tenantId", "customerId");
