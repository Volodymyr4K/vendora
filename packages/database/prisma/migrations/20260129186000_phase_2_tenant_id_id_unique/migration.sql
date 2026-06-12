-- Optional reinforcement (Phase 2): DB-level tenant scope for update by id.
-- Enables where: { tenantId_id: { tenantId, id } } for ItemVariant, OptionGroup, OptionItem.

CREATE UNIQUE INDEX "ItemVariant_tenantId_id_key" ON "ItemVariant"("tenantId", "id");
CREATE UNIQUE INDEX "OptionGroup_tenantId_id_key" ON "OptionGroup"("tenantId", "id");
CREATE UNIQUE INDEX "OptionItem_tenantId_id_key" ON "OptionItem"("tenantId", "id");
