/*
  Warnings:

  - A unique constraint covering the columns `[id,tenantId]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[tenantId,idempotencyScope,idempotencyKey]` on the table `Order` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateEnum
CREATE TYPE "BranchMemberRole" AS ENUM ('BRANCH_ADMIN', 'BRANCH_STAFF');

-- CreateEnum
CREATE TYPE "OutboxStatus" AS ENUM ('PENDING', 'PROCESSING', 'SENT', 'DEAD');

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "idempotencyScope" TEXT;

-- CreateTable
CREATE TABLE "EventOutbox" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "OutboxStatus" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventOutbox_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BranchMember" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "BranchMemberRole" NOT NULL DEFAULT 'BRANCH_STAFF',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BranchMember_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventOutbox_status_nextAttemptAt_idx" ON "EventOutbox"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "BranchMember_tenantId_userId_idx" ON "BranchMember"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "BranchMember_tenantId_branchId_idx" ON "BranchMember"("tenantId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "BranchMember_tenantId_branchId_userId_key" ON "BranchMember"("tenantId", "branchId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Branch_id_tenantId_key" ON "Branch"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_tenantId_idempotencyScope_idempotencyKey_key" ON "Order"("tenantId", "idempotencyScope", "idempotencyKey");

-- AddForeignKey
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_branchId_tenantId_fkey" FOREIGN KEY ("branchId", "tenantId") REFERENCES "Branch"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BranchMember" ADD CONSTRAINT "BranchMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
