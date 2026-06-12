-- CreateEnum
CREATE TYPE "BranchesMode" AS ENUM ('SINGLE', 'MULTI');

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN "branchesMode" "BranchesMode" NOT NULL DEFAULT 'MULTI',
ADD COLUMN "defaultBranchId" TEXT;

-- AddForeignKey
ALTER TABLE "Tenant" ADD CONSTRAINT "Tenant_defaultBranchId_fkey" FOREIGN KEY ("defaultBranchId") REFERENCES "Branch"("id") ON DELETE SET NULL ON UPDATE CASCADE;
