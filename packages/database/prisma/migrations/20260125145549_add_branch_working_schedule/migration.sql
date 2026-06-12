/*
  Warnings:

  - You are about to drop the `BranchMember` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "BranchMember" DROP CONSTRAINT "BranchMember_branchId_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "BranchMember" DROP CONSTRAINT "BranchMember_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "BranchMember" DROP CONSTRAINT "BranchMember_userId_tenantId_fkey";

-- DropIndex
DROP INDEX "Branch_id_tenantId_key";

-- DropIndex
DROP INDEX "User_id_tenantId_key";

-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "workingSchedule" JSONB;

-- DropTable
DROP TABLE "BranchMember";

-- DropEnum
DROP TYPE "BranchMemberRole";
