-- ACCESS_LEVELS: 3 critical DB invariants (CHECK scopeType↔branchId, composite FK to TenantUser, branchId→Branch)

-- 1) CHECK: scopeType ↔ branchId consistency (ALL => branchId IS NULL, BRANCH => branchId IS NOT NULL)
ALTER TABLE "TenantUserModulePermission" ADD CONSTRAINT "TenantUserModulePermission_scopeType_branchId_check"
  CHECK (
    ("scopeType" = 'ALL' AND "branchId" IS NULL)
    OR ("scopeType" = 'BRANCH' AND "branchId" IS NOT NULL)
  );

-- 2) Composite FK: permissions/capabilities only for actual tenant members (referential integrity to TenantUser)
ALTER TABLE "TenantUserModulePermission" ADD CONSTRAINT "TenantUserModulePermission_tenantId_userId_fkey"
  FOREIGN KEY ("tenantId", "userId") REFERENCES "TenantUser"("tenantId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserCapability" ADD CONSTRAINT "UserCapability_tenantId_userId_fkey"
  FOREIGN KEY ("tenantId", "userId") REFERENCES "TenantUser"("tenantId", "userId") ON DELETE CASCADE ON UPDATE CASCADE;

-- 3) FK: branchId (when set) must reference Branch.id; same-tenant enforced at application level if needed
ALTER TABLE "TenantUserModulePermission" ADD CONSTRAINT "TenantUserModulePermission_branchId_fkey"
  FOREIGN KEY ("branchId") REFERENCES "Branch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
