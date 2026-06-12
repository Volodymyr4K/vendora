-- Phase 7: Backfill Tenant Features Migration
-- Goal: Set default feature flags for all existing tenants
-- Safe to run multiple times (idempotent)

-- Step 1: Check current state
SELECT 
  COUNT(*) as total_tenants,
  COUNT(CASE WHEN features IS NULL THEN 1 END) as null_features,
  COUNT(CASE WHEN features = '{}'::jsonb THEN 1 END) as empty_features,
  COUNT(CASE WHEN features IS NOT NULL AND NOT (features ? 'modules') THEN 1 END) as missing_modules
FROM "Tenant";

-- Step 2: Backfill default features for all tenants without proper structure
-- This handles: NULL, {}, and incomplete feature objects
UPDATE "Tenant"
SET features = '{
  "version": 1,
  "modules": {
    "profile": true,
    "ordering": true,
    "delivery": true
  }
}'::jsonb
WHERE features IS NULL          -- Handle NULL fields
   OR features = '{}'::jsonb    -- Handle empty JSON objects
   OR NOT (features ? 'modules'); -- Handle incomplete structures

-- Step 3: Verify migration
SELECT 
  COUNT(*) as total_tenants,
  COUNT(CASE WHEN features IS NULL THEN 1 END) as null_features,
  COUNT(CASE WHEN features = '{}'::jsonb THEN 1 END) as empty_features,
  COUNT(CASE WHEN NOT (features ? 'modules') THEN 1 END) as missing_modules
FROM "Tenant";
-- Should show: null_features=0, empty_features=0, missing_modules=0

-- Step 4: Sample output to verify structure
SELECT id, name, slug, features 
FROM "Tenant" 
ORDER BY "createdAt" DESC 
LIMIT 5;
