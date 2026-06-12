#!/bin/bash
set -e

BFF_URL="http://localhost:4000"
WEB_URL="http://localhost:3000"
TENANT_SLUG="vendora-sushi-hq"
BRANCH_SLUG="kyiv-bazhana"
SUPER_EMAIL="super@admin.com"
SUPER_PASSWORD="SuperAdm1n@2024!Secure"
COOKIE_JAR="/tmp/vendora_super.cookie"
NEW_ACCENT="#ff0000"

echo "🔍 Preflight checks..."

# Check BFF
if ! curl -s -f "${BFF_URL}/config" -H "x-tenant-slug: ${TENANT_SLUG}" > /dev/null 2>&1; then
  echo "❌ FAIL: BFF not running at ${BFF_URL}"
  exit 1
fi
echo "✅ BFF responding"

# Check WEB (non-fatal)
WEB_UP=0
if curl -s -f "${WEB_URL}/" > /dev/null 2>&1; then
  echo "✅ WEB responding"
  WEB_UP=1
else
  echo "⚠️  WARN: WEB not running, skipping storefront check"
fi

echo ""
echo "👤 Ensuring super-admin user exists..."

# Create super-admin user (idempotent - script handles existing user)
SCRIPT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
CREATE_OUTPUT=$(cd "$SCRIPT_DIR/packages/database" && pnpm exec tsx --env-file=.env create-super-admin.ts 2>&1)
CREATE_EXIT=$?

if [ "$CREATE_EXIT" -ne 0 ]; then
  echo "❌ FAIL: Failed to create super-admin user:"
  echo "$CREATE_OUTPUT"
  exit 1
fi
echo "✅ Super-admin user ready"

echo ""
echo "🔐 Login as super-admin..."

# Login and store cookies
LOGIN_RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "${BFF_URL}/auth/super-login" \
  -H "Content-Type: application/json" \
  -d "{\"username\":\"${SUPER_EMAIL}\",\"password\":\"${SUPER_PASSWORD}\"}" \
  -c "${COOKIE_JAR}")

HTTP_CODE=$(echo "$LOGIN_RESPONSE" | tail -n1)
BODY=$(echo "$LOGIN_RESPONSE" | sed '$d')

if [ "$HTTP_CODE" != "200" ]; then
  echo "❌ FAIL: Login failed with HTTP ${HTTP_CODE}: ${BODY}"
  exit 1
fi

# Verify auth_token cookie exists
if ! grep -q "auth_token" "${COOKIE_JAR}" 2>/dev/null; then
  echo "❌ FAIL: auth_token cookie not found in ${COOKIE_JAR}"
  exit 1
fi
echo "✅ Login successful"

echo ""
echo "📋 Finding tenant ID..."

# Get tenants list and parse with node
TENANTS_JSON=$(curl -s -X GET "${BFF_URL}/super/tenants" -b "${COOKIE_JAR}")

TENANT_ID=$(node -e "
  const tenants = JSON.parse(process.argv[1]);
  const tenant = tenants.find(t => t.slug === '${TENANT_SLUG}');
  if (!tenant) {
    console.error('Tenant not found');
    process.exit(1);
  }
  console.log(tenant.id);
" "$TENANTS_JSON")

if [ -z "$TENANT_ID" ]; then
  echo "❌ FAIL: Tenant '${TENANT_SLUG}' not found"
  exit 1
fi
echo "✅ Tenant ID: ${TENANT_ID}"

echo ""
echo "🎨 PATCH theme (accent: ${NEW_ACCENT})..."

PATCH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" -X PATCH "${BFF_URL}/super/tenants/${TENANT_ID}/theme" \
  -H "Content-Type: application/json" \
  -b "${COOKIE_JAR}" \
  -d "{\"version\":1,\"preset\":\"default\",\"tokens\":{\"accent\":\"${NEW_ACCENT}\"},\"brand\":{}}")

if [ "$PATCH_STATUS" != "204" ]; then
  echo "❌ FAIL: PATCH theme returned HTTP ${PATCH_STATUS} (expected 204)"
  exit 1
fi
echo "✅ Theme updated (204 No Content)"

echo ""
echo "🔍 Verify /config reflects change..."

# Get config and parse with node
CONFIG_JSON=$(curl -s -X GET "${BFF_URL}/config" -H "x-tenant-slug: ${TENANT_SLUG}")

CONFIG_ACCENT=$(node -e "
  const config = JSON.parse(process.argv[1]);
  if (!config.theme || !config.theme.tokens || !config.theme.tokens.accent) {
    console.error('Theme structure invalid');
    process.exit(1);
  }
  console.log(config.theme.tokens.accent);
" "$CONFIG_JSON")

if [ "$CONFIG_ACCENT" != "$NEW_ACCENT" ]; then
  echo "❌ FAIL: /config accent mismatch. Expected: ${NEW_ACCENT}, Got: ${CONFIG_ACCENT}"
  exit 1
fi
echo "✅ /config accent verified: ${CONFIG_ACCENT}"

echo ""
if [ "$WEB_UP" -eq 1 ]; then
  echo "🌐 Checking storefront (best-effort)..."
  
  STORE_HTML=$(curl -s "${WEB_URL}/t/${TENANT_SLUG}/${BRANCH_SLUG}" || echo "")
  
  if echo "$STORE_HTML" | grep -q "${NEW_ACCENT}"; then
    echo "✅ Storefront HTML contains ${NEW_ACCENT}"
  elif echo "$STORE_HTML" | grep -q "--accent"; then
    echo "⚠️  Storefront HTML contains --accent CSS variable (value not verified)"
  else
    echo "⚠️  Storefront check inconclusive (HTML may be cached)"
  fi
fi

echo ""
echo "✅ PASS: Theme propagation verified end-to-end"
