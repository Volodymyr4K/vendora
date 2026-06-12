/*
  Warnings:

  - The `status` column on the `CustomDomain` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "DomainStatus" AS ENUM ('PENDING', 'VERIFIED', 'FAILED');

-- AlterTable
ALTER TABLE "CustomDomain" DROP COLUMN "status",
ADD COLUMN     "status" "DomainStatus" NOT NULL DEFAULT 'PENDING';

-- CreateIndex
CREATE INDEX "CustomDomain_status_idx" ON "CustomDomain"("status");

-- CreateIndex
CREATE INDEX "CustomDomain_tenantId_status_idx" ON "CustomDomain"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomDomain_status_failureCount_idx" ON "CustomDomain"("status", "failureCount");
