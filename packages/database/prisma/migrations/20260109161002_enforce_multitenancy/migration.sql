/*
  Warnings:

  - A unique constraint covering the columns `[slug,tenantId]` on the table `Branch` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug,tenantId]` on the table `Category` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[orderId,tenantId]` on the table `Order` will be added. If there are existing duplicate values, this will fail.
  - A unique constraint covering the columns `[slug,tenantId]` on the table `Product` will be added. If there are existing duplicate values, this will fail.
  - Made the column `tenantId` on table `Branch` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Category` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `tenantId` on table `Product` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE "Branch" DROP CONSTRAINT "Branch_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Category" DROP CONSTRAINT "Category_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Order" DROP CONSTRAINT "Order_tenantId_fkey";

-- DropForeignKey
ALTER TABLE "Product" DROP CONSTRAINT "Product_tenantId_fkey";

-- DropIndex
DROP INDEX "Branch_slug_key";

-- DropIndex
DROP INDEX "Category_slug_key";

-- DropIndex
DROP INDEX "Order_orderId_key";

-- DropIndex
DROP INDEX "Product_slug_key";

-- AlterTable
ALTER TABLE "Branch" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Category" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Order" ALTER COLUMN "tenantId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Product" ALTER COLUMN "tenantId" SET NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Branch_slug_tenantId_key" ON "Branch"("slug", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_slug_tenantId_key" ON "Category"("slug", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Order_orderId_tenantId_key" ON "Order"("orderId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Product_slug_tenantId_key" ON "Product"("slug", "tenantId");

-- AddForeignKey
ALTER TABLE "Branch" ADD CONSTRAINT "Branch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Product" ADD CONSTRAINT "Product_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
