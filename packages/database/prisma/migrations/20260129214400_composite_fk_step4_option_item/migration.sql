-- Composite FK plan step 4: OptionItem → OptionGroup (tenantId, optionGroupId)
ALTER TABLE "OptionItem" DROP CONSTRAINT "OptionItem_optionGroupId_fkey";

ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_tenantId_optionGroupId_fkey" FOREIGN KEY ("tenantId", "optionGroupId") REFERENCES "OptionGroup"("tenantId", "id") ON DELETE CASCADE ON UPDATE CASCADE;
