-- Phase 4.1: Offer tenant-scoped update/delete (compound key tenantId, id)

CREATE UNIQUE INDEX "Offer_tenant_id_key" ON "Offer"("tenantId", "id");
