-- Phase 6.1: Integration, IntegrationState, ExternalMapping (connections, sync state, external id ↔ internal id mapping)

CREATE TYPE "IntegrationStatus" AS ENUM ('PENDING', 'ACTIVE', 'ERROR', 'DISABLED');

CREATE TABLE "Integration" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "credentialsRef" TEXT,
    "status" "IntegrationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Integration_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Integration_tenantId_provider_key" ON "Integration"("tenantId", "provider");
CREATE UNIQUE INDEX "Integration_tenant_id_key" ON "Integration"("tenantId", "id");
CREATE INDEX "Integration_tenantId_idx" ON "Integration"("tenantId");

ALTER TABLE "Integration" ADD CONSTRAINT "Integration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "IntegrationState" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "cursor" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "IntegrationState_tenantId_provider_entityType_key" ON "IntegrationState"("tenantId", "provider", "entityType");
CREATE INDEX "IntegrationState_tenantId_idx" ON "IntegrationState"("tenantId");

ALTER TABLE "IntegrationState" ADD CONSTRAINT "IntegrationState_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "IntegrationState" ADD CONSTRAINT "IntegrationState_tenantId_provider_fkey" FOREIGN KEY ("tenantId", "provider") REFERENCES "Integration"("tenantId", "provider") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ExternalMapping" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "internalId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ExternalMapping_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ExternalMapping_tenantId_provider_entityType_externalId_key" ON "ExternalMapping"("tenantId", "provider", "entityType", "externalId");
CREATE UNIQUE INDEX "ExternalMapping_tenantId_provider_entityType_internalId_key" ON "ExternalMapping"("tenantId", "provider", "entityType", "internalId");
CREATE INDEX "ExternalMapping_tenantId_idx" ON "ExternalMapping"("tenantId");

ALTER TABLE "ExternalMapping" ADD CONSTRAINT "ExternalMapping_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ExternalMapping" ADD CONSTRAINT "ExternalMapping_tenantId_provider_fkey" FOREIGN KEY ("tenantId", "provider") REFERENCES "Integration"("tenantId", "provider") ON DELETE CASCADE ON UPDATE CASCADE;
