-- AlterTable
ALTER TABLE "JournalPost" ADD COLUMN "homeSlot" INTEGER;

-- CreateIndex
CREATE INDEX "JournalPost_tenantId_homeSlot_idx" ON "JournalPost"("tenantId", "homeSlot");

