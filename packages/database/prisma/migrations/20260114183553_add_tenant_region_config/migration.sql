-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "countryCode" TEXT NOT NULL DEFAULT 'UA',
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'UAH';
