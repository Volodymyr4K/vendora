-- Composite FK plan step 2: CategoryBranch → Category, Branch (composite FKs)
-- Preflight: constraint names from existing migrations (phase_1_3_catalog_item_category_branch).
ALTER TABLE "CategoryBranch" DROP CONSTRAINT "CategoryBranch_categoryId_fkey";
ALTER TABLE "CategoryBranch" DROP CONSTRAINT "CategoryBranch_branchId_fkey";

ALTER TABLE "CategoryBranch" ADD CONSTRAINT "CategoryBranch_tenantId_categoryId_fkey" FOREIGN KEY ("tenantId", "categoryId") REFERENCES "Category"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CategoryBranch" ADD CONSTRAINT "CategoryBranch_tenantId_branchId_fkey" FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
