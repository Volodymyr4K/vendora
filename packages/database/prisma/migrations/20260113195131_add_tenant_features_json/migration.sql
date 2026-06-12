-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "features" JSONB NOT NULL DEFAULT '{"version": 1, "modules": {}, "limits": {}, "integrations": {}}',
ADD COLUMN     "settings" JSONB NOT NULL DEFAULT '{}';
