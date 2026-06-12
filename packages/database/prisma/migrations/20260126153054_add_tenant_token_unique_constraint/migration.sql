-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_token_key" ON "Order"("tenantId", "token");
