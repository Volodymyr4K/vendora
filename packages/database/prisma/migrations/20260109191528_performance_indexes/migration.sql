-- CreateIndex
CREATE INDEX "Branch_slug_idx" ON "Branch"("slug");

-- CreateIndex
CREATE INDEX "Category_tenantId_sortOrder_idx" ON "Category"("tenantId", "sortOrder");

-- CreateIndex
CREATE INDEX "Order_tenantId_branchSlug_createdAt_idx" ON "Order"("tenantId", "branchSlug", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "Order_tenantId_status_idx" ON "Order"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Product_tenantId_categoryId_isAvailable_idx" ON "Product"("tenantId", "categoryId", "isAvailable");
