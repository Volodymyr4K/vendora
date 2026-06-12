-- Optional reinforcement (Phase 3): DB-level tenant scope for Order update by id.
-- Enables where: { tenantId_id: { tenantId, id } } in central updateOrder.

CREATE UNIQUE INDEX "Order_tenantId_id_key" ON "Order"("tenantId", "id");
