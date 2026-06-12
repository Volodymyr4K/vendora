-- Ensure CustomerFavorite.tenantId matches Customer and Product tenant (DB-level guarantee).
-- PostgreSQL CHECK cannot use subqueries; use a BEFORE trigger instead.
CREATE OR REPLACE FUNCTION "CustomerFavorite_tenant_consistency"()
RETURNS TRIGGER AS $$
DECLARE
  cust_tenant TEXT;
  prod_tenant TEXT;
BEGIN
  SELECT "tenantId" INTO cust_tenant FROM "Customer" WHERE "id" = NEW."customerId";
  IF cust_tenant IS NULL THEN
    RAISE EXCEPTION 'CustomerFavorite: customerId % not found', NEW."customerId";
  END IF;
  IF cust_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'CustomerFavorite: tenantId must match Customer.tenantId (customerId=%)', NEW."customerId";
  END IF;

  SELECT "tenantId" INTO prod_tenant FROM "Product" WHERE "id" = NEW."productId";
  IF prod_tenant IS NULL THEN
    RAISE EXCEPTION 'CustomerFavorite: productId % not found', NEW."productId";
  END IF;
  IF prod_tenant IS DISTINCT FROM NEW."tenantId" THEN
    RAISE EXCEPTION 'CustomerFavorite: tenantId must match Product.tenantId (productId=%)', NEW."productId";
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS "CustomerFavorite_tenant_consistency_trigger" ON "CustomerFavorite";
CREATE TRIGGER "CustomerFavorite_tenant_consistency_trigger"
  BEFORE INSERT OR UPDATE ON "CustomerFavorite"
  FOR EACH ROW EXECUTE PROCEDURE "CustomerFavorite_tenant_consistency"();
