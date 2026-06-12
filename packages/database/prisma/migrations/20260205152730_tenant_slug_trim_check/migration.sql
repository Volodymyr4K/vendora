-- Ensure there are no bad rows (fail fast if non-trimmed slugs exist)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "Tenant"
    WHERE slug IS NOT NULL AND slug <> btrim(slug)
    LIMIT 1
  ) THEN
    RAISE EXCEPTION 'Tenant.slug contains leading/trailing whitespace; aborting migration';
  END IF;
END $$;

-- Add the constraint (guard against re-apply in dev by checking pg_constraint)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'Tenant'
      AND c.conname = 'Tenant_slug_trim'
  ) THEN
    ALTER TABLE "Tenant"
    ADD CONSTRAINT "Tenant_slug_trim"
    CHECK (slug IS NULL OR slug = btrim(slug));
  END IF;
END $$;
