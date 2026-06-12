ALTER TABLE "Tenant"
ADD CONSTRAINT "Tenant_slug_lowercase"
CHECK ("slug" = lower("slug")) NOT VALID;

ALTER TABLE "Tenant"
VALIDATE CONSTRAINT "Tenant_slug_lowercase";
