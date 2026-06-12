-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "isScheduledOrderingEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "minAdvanceMinutes" INTEGER NOT NULL DEFAULT 90,
ADD COLUMN     "prepTimeMinutes" INTEGER NOT NULL DEFAULT 30;
