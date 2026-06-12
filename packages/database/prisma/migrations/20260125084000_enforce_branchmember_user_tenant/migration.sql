/*
  Warnings:

  - A unique constraint covering the columns `[id,tenantId]` on the table `User` will be added. If there are existing duplicate values, this will fail.

*/
-- DropForeignKey
ALTER TABLE "BranchMember" DROP CONSTRAINT "BranchMember_userId_fkey";

-- CreateIndex
CREATE UNIQUE INDEX "User_id_tenantId_key" ON "User"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_userId_tenantId_fkey" FOREIGN KEY ("userId", "tenantId") REFERENCES "User"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;
