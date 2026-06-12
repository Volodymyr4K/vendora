-- ACCESS_LEVELS Phase 1.3: admin permissions (module view/edit) + UserCapability (high-risk actions)

-- CreateEnum
CREATE TYPE "PermissionScopeType" AS ENUM ('ALL', 'BRANCH');

-- CreateTable
CREATE TABLE "TenantUserModulePermission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "moduleId" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL,
    "canEdit" BOOLEAN NOT NULL,
    "scopeType" "PermissionScopeType" NOT NULL DEFAULT 'ALL',
    "branchId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TenantUserModulePermission_pkey" PRIMARY KEY ("id")
);

-- One row per (tenant, user, module) when scopeType = ALL (branchId is null)
CREATE UNIQUE INDEX "TenantUserModulePermission_tenantId_userId_moduleId_all_key"
    ON "TenantUserModulePermission"("tenantId", "userId", "moduleId")
    WHERE "scopeType" = 'ALL' AND "branchId" IS NULL;

-- One row per (tenant, user, module, branchId) when scopeType = BRANCH
CREATE UNIQUE INDEX "TenantUserModulePermission_tenantId_userId_moduleId_branch_key"
    ON "TenantUserModulePermission"("tenantId", "userId", "moduleId", "branchId")
    WHERE "scopeType" = 'BRANCH' AND "branchId" IS NOT NULL;

-- CreateIndex
CREATE INDEX "TenantUserModulePermission_tenantId_idx" ON "TenantUserModulePermission"("tenantId");
CREATE INDEX "TenantUserModulePermission_userId_idx" ON "TenantUserModulePermission"("userId");
CREATE INDEX "TenantUserModulePermission_tenantId_userId_moduleId_idx" ON "TenantUserModulePermission"("tenantId", "userId", "moduleId");

-- AddForeignKey
ALTER TABLE "TenantUserModulePermission" ADD CONSTRAINT "TenantUserModulePermission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TenantUserModulePermission" ADD CONSTRAINT "TenantUserModulePermission_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable UserCapability
CREATE TABLE "UserCapability" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "capabilityId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserCapability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "UserCapability_tenantId_userId_capabilityId_key" ON "UserCapability"("tenantId", "userId", "capabilityId");
CREATE INDEX "UserCapability_tenantId_idx" ON "UserCapability"("tenantId");
CREATE INDEX "UserCapability_userId_idx" ON "UserCapability"("userId");

-- AddForeignKey
ALTER TABLE "UserCapability" ADD CONSTRAINT "UserCapability_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCapability" ADD CONSTRAINT "UserCapability_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
