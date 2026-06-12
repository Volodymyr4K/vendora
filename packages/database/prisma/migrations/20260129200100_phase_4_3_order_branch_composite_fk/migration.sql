-- Phase 4.3 guardrail: Order → Branch must be composite (tenantId, branchId) REFERENCES Branch(tenantId, id).
-- Prevents cross-tenant "hang" on foreign branchId if a write-path omits tenant validation.

ALTER TABLE "Order" DROP CONSTRAINT IF EXISTS "Order_branchId_fkey";

ALTER TABLE "Order" ADD CONSTRAINT "Order_branch_tenant_fkey"
  FOREIGN KEY ("tenantId", "branchId") REFERENCES "Branch"("tenantId", "id") ON DELETE RESTRICT ON UPDATE CASCADE;
