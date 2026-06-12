/*
  Warnings:

  - You are about to drop the column `weightG` on the `Product` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "CustomDomain" ADD COLUMN     "gracePeriodStartedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Product" DROP COLUMN "weightG";
