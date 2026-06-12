-- AlterTable
ALTER TABLE "Branch" ADD COLUMN     "timezone" TEXT;

-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Europe/Kiev';
