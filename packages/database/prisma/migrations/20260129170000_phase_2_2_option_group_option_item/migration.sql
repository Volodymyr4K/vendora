-- Phase 2.2: OptionGroup, OptionItem, CatalogItemOptionGroup (modifiers, tenant-safe M:N)

CREATE TABLE "OptionGroup" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "min" INTEGER,
    "max" INTEGER,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionGroup_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OptionItem" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "priceDeltaCents" INTEGER,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "CatalogItemOptionGroup" (
    "tenantId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "optionGroupId" TEXT NOT NULL,

    CONSTRAINT "CatalogItemOptionGroup_pkey" PRIMARY KEY ("tenantId","catalogItemId","optionGroupId")
);

CREATE INDEX "OptionGroup_tenantId_idx" ON "OptionGroup"("tenantId");

CREATE INDEX "OptionItem_tenantId_idx" ON "OptionItem"("tenantId");

CREATE INDEX "OptionItem_optionGroupId_idx" ON "OptionItem"("optionGroupId");

CREATE INDEX "CatalogItemOptionGroup_tenantId_idx" ON "CatalogItemOptionGroup"("tenantId");

CREATE INDEX "CatalogItemOptionGroup_catalogItemId_idx" ON "CatalogItemOptionGroup"("catalogItemId");

CREATE INDEX "CatalogItemOptionGroup_optionGroupId_idx" ON "CatalogItemOptionGroup"("optionGroupId");

ALTER TABLE "OptionGroup" ADD CONSTRAINT "OptionGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "OptionItem" ADD CONSTRAINT "OptionItem_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogItemOptionGroup" ADD CONSTRAINT "CatalogItemOptionGroup_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogItemOptionGroup" ADD CONSTRAINT "CatalogItemOptionGroup_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "CatalogItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CatalogItemOptionGroup" ADD CONSTRAINT "CatalogItemOptionGroup_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "OptionGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;
