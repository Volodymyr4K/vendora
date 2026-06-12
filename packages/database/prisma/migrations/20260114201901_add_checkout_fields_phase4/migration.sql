-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "comment" TEXT,
ADD COLUMN     "personCount" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "requestedDeliveryTime" TIMESTAMP(3);
