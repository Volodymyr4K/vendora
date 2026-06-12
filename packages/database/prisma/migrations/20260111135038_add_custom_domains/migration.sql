-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "customDomainsEnabled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CustomDomain" (
    "id" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "verifiedBy" TEXT,
    "txtRecord" TEXT NOT NULL,
    "cnameValid" BOOLEAN NOT NULL DEFAULT false,
    "httpVerified" BOOLEAN NOT NULL DEFAULT false,
    "providerDomainId" TEXT,
    "failureCount" INTEGER NOT NULL DEFAULT 0,
    "lastFailureAt" TIMESTAMP(3),
    "isPrimary" BOOLEAN NOT NULL DEFAULT true,
    "isWildcard" BOOLEAN NOT NULL DEFAULT false,
    "provider" TEXT DEFAULT 'vercel',
    "cnameTarget" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastVerifiedAt" TIMESTAMP(3),

    CONSTRAINT "CustomDomain_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CustomDomain_domain_key" ON "CustomDomain"("domain");

-- CreateIndex
CREATE INDEX "CustomDomain_domain_idx" ON "CustomDomain"("domain");

-- CreateIndex
CREATE INDEX "CustomDomain_tenantId_idx" ON "CustomDomain"("tenantId");

-- CreateIndex
CREATE INDEX "CustomDomain_status_idx" ON "CustomDomain"("status");

-- CreateIndex
CREATE INDEX "CustomDomain_tenantId_status_idx" ON "CustomDomain"("tenantId", "status");

-- CreateIndex
CREATE INDEX "CustomDomain_tenantId_isPrimary_idx" ON "CustomDomain"("tenantId", "isPrimary");

-- AddForeignKey
ALTER TABLE "CustomDomain" ADD CONSTRAINT "CustomDomain_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
