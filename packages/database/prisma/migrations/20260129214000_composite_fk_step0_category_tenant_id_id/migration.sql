-- Composite FK plan step 0: Category must have @@unique([tenantId, id]) before CategoryBranch composite FK
CREATE UNIQUE INDEX "Category_tenantId_id_key" ON "Category"("tenantId", "id");
