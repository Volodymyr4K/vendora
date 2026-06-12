-- Phase 1.3: Product → CatalogItem; Category–Branch explicit join (tenant-scoped)
-- Data is test-only; no backfill. Drop Product and CustomerFavorite; create CatalogItem, CategoryBranch, CustomerFavorite.

-- 1. Drop CustomerFavorite tenant-consistency trigger and function (references Product)
DROP TRIGGER IF EXISTS "CustomerFavorite_tenant_consistency_trigger" ON "CustomerFavorite";
DROP FUNCTION IF EXISTS "CustomerFavorite_tenant_consistency"();

-- 2. Drop CustomerFavorite (FK to Product)
DROP TABLE "CustomerFavorite";

-- 3. Drop Product
DROP TABLE "Product";

-- 4. Drop implicit M:N table Category–Branch
DROP TABLE "_BranchToCategory";

-- 5. Create enums for CatalogItem
CREATE TYPE "CatalogItemBaseType" AS ENUM ('GOOD', 'SERVICE');
CREATE TYPE "CatalogItemStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- 6. Create CatalogItem
CREATE TABLE "CatalogItem" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "desc" TEXT,
    "baseType" "CatalogItemBaseType" NOT NULL DEFAULT 'GOOD',
    "status" "CatalogItemStatus" NOT NULL DEFAULT 'ACTIVE',
    "basePriceCents" INTEGER,
    "imageUrl" TEXT,
    "weightG" INTEGER,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CatalogItem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogItem_slug_tenantId_key" ON "CatalogItem"("slug", "tenantId");
CREATE INDEX "CatalogItem_tenantId_idx" ON "CatalogItem"("tenantId");
CREATE INDEX "CatalogItem_tenantId_categoryId_status_idx" ON "CatalogItem"("tenantId", "categoryId", "status");

ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CatalogItem" ADD CONSTRAINT "CatalogItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- 7. Create CategoryBranch (explicit join, tenant-scoped)
CREATE TABLE "CategoryBranch" (
    "tenantId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,

    CONSTRAINT "CategoryBranch_tenantId_categoryId_branchId_key" UNIQUE ("tenantId", "categoryId", "branchId")
);

CREATE INDEX "CategoryBranch_tenantId_idx" ON "CategoryBranch"("tenantId");
CREATE INDEX "CategoryBranch_categoryId_idx" ON "CategoryBranch"("categoryId");
CREATE INDEX "CategoryBranch_branchId_idx" ON "CategoryBranch"("branchId");

ALTER TABLE "CategoryBranch" ADD CONSTRAINT "CategoryBranch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryBranch" ADD CONSTRAINT "CategoryBranch_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryBranch" ADD CONSTRAINT "CategoryBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 8. Create CustomerFavorite (catalogItemId)
CREATE TABLE "CustomerFavorite" (
    "customerId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerFavorite_tenantId_customerId_catalogItemId_key" UNIQUE ("tenantId", "customerId", "catalogItemId")
);

CREATE INDEX "CustomerFavorite_tenantId_idx" ON "CustomerFavorite"("tenantId");
CREATE INDEX "CustomerFavorite_tenantId_customerId_idx" ON "CustomerFavorite"("tenantId", "customerId");

ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CustomerFavorite" ADD CONSTRAINT "CustomerFavorite_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 9. CustomerFavorite tenant consistency trigger (CatalogItem)
CREATE OR REPLACE FUNCTION "CustomerFavorite_tenant_consistency"()
RETURNS TRIGGER AS $$
DECLARE
  cust_tenant TEXT;
  item_tenant TEXT;
BEGIN
  SELECT "tenantId" INTO cust_tenant FROM "Customer" WHERE "id" = NEW."customerId";
  IF cust_tenant IS NULL THEN
    RAISE EXCEPTION 'CustomerFavorite: customerId % not found', NEW."customerId";
  END IF;
  IF cust_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'CustomerFavorite: tenantId must match Customer.tenantId (customerId=%)', NEW."customerId";
  END IF;

  SELECT "tenantId" INTO item_tenant FROM "CatalogItem" WHERE "id" = NEW."catalogItemId";
  IF item_tenant IS NULL THEN
    RAISE EXCEPTION 'CustomerFavorite: catalogItemId % not found', NEW."catalogItemId";
  END IF;
  IF item_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'CustomerFavorite: tenantId must match CatalogItem.tenantId (catalogItemId=%)', NEW."catalogItemId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "CustomerFavorite_tenant_consistency_trigger"
  BEFORE INSERT OR UPDATE ON "CustomerFavorite"
  FOR EACH ROW EXECUTE PROCEDURE "CustomerFavorite_tenant_consistency"();
