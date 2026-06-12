#!/usr/bin/env node
/**
 * CI gate: forbid unsafe Prisma calls on tenant-owned models in tenant-scoped code.
 *
 * Scope: apps/bff/src/domains (excluding super-admin, internal, infra)
 *        apps/bff/src/services (excluding tenant-resolver, cache-warmer, domain-verification-cron)
 *        apps/bff/src/plugins, src/lib, src/cache
 *
 * Rules:
 * - findUnique/update/delete on tenant models: where must include tenantId or compound key
 *   (tenantId_token, slug_tenantId, phone_tenantId, tenantId_idempotencyScope_idempotencyKey).
 * - findFirst/findMany/updateMany/deleteMany: where must include tenantId.
 *
 * Out of scope (not scanned): super-admin, internal, infra, tenant-resolver, cache-warmer,
 * domain-verification-cron, order-update (Phase 3.5 central update; where from callers).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..', 'src');

const TENANT_MODELS = new Set([
  'order', 'orderLine', 'orderLineOption', 'orderAdjustment', 'fulfillment', 'branch', 'category', 'catalogItem', 'categoryBranch', 'customer',
  'customerAddress', 'customerFavorite', 'customDomain', 'itemNutritionFacet', 'itemVariant',
  'optionGroup', 'optionItem', 'catalogItemOptionGroup', 'offer',  // Phase 4.1
  'attributeDefinition', 'attributeValue',  // Phase 5.1
  'itemAllergenFacet',  // Phase 5.2
  'integration', 'integrationState', 'externalMapping',  // Phase 6.1
  'deliveryConfigFacet'  // Phase 6.2
]);

const UNSAFE_METHODS = ['findUnique', 'update', 'delete'];
const MANY_METHODS = ['findFirst', 'findMany', 'updateMany', 'deleteMany'];
const COMPOUND_KEYS = [
  'tenantId_token', 'slug_tenantId', 'phone_tenantId',
  'tenantId_idempotencyScope_idempotencyKey',
  'tenantId_id',  // Branch, CatalogItem, Order, Offer, OptionGroup, OptionItem, AttributeDefinition, etc.
  'tenantId_branchId_variantId',  // Offer (Phase 4.1)
  'tenantId_itemId_definitionId',  // Phase 5.1 AttributeValue
  'tenantId_provider',  // Phase 6.1 Integration
  'tenantId_provider_entityType',  // Phase 6.1 IntegrationState
  'tenantId_provider_entityType_externalId',  // Phase 6.1 ExternalMapping
  'tenantId_provider_entityType_internalId',
  'tenantId_branchId'  // Phase 6.2 DeliveryConfigFacet
];

function isOutOfScope(relPath) {
  const n = relPath.replace(/\\/g, '/');
  if (n.includes('domains/super-admin/')) return true;
  if (n.includes('domains/internal/')) return true;
  if (n.includes('domains/infra/')) return true;
  if (n.includes('services/tenant-resolver')) return true;
  if (n.includes('services/cache-warmer')) return true;
  if (n.includes('services/domain-verification-cron')) return true;
  // Phase 3.5: central order update; where is passed by callers (admin, payment) with tenant-scoped selector
  if (n.includes('services/order-update')) return true;
  // Phase 4 DoD: global metric job (missing_offer) — intentionally cross-tenant
  if (n.includes('services/missing-offer-metric')) return true;
  return false;
}

function* walk(dir, base = '') {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const rel = path.join(base, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      yield* walk(path.join(dir, e.name), rel);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      yield { full: path.join(dir, e.name), rel };
    }
  }
}

function getScopeFiles() {
  const files = [];
  const domainsDir = path.join(SRC_ROOT, 'domains');
  const servicesDir = path.join(SRC_ROOT, 'services');
  if (fs.existsSync(domainsDir)) {
    for (const { full, rel } of walk(domainsDir, 'domains')) {
      if (!isOutOfScope(rel)) files.push({ full, rel: path.join('src', rel) });
    }
  }
  if (fs.existsSync(servicesDir)) {
    for (const { full, rel } of walk(servicesDir, 'services')) {
      if (!isOutOfScope(rel)) files.push({ full, rel: path.join('src', rel) });
    }
  }
  const pluginsDir = path.join(SRC_ROOT, 'plugins');
  const libDir = path.join(SRC_ROOT, 'lib');
  const cacheDir = path.join(SRC_ROOT, 'cache');
  if (fs.existsSync(pluginsDir)) {
    for (const { full, rel } of walk(pluginsDir, 'plugins')) {
      files.push({ full, rel: path.join('src', rel) });
    }
  }
  if (fs.existsSync(libDir)) {
    for (const { full, rel } of walk(libDir, 'lib')) {
      files.push({ full, rel: path.join('src', rel) });
    }
  }
  if (fs.existsSync(cacheDir)) {
    for (const { full, rel } of walk(cacheDir, 'cache')) {
      files.push({ full, rel: path.join('src', rel) });
    }
  }
  return files;
}

const CLIENT_RE = /(?:deps\.prisma|prisma|tx)\s*\.\s*([a-zA-Z]+)\s*\.\s*(findUnique|update|delete|findFirst|findMany|updateMany|deleteMany)\s*\(\s*\{/g;

/**
 * Find matching closing brace from opening { at startIndex.
 * Ignores braces inside strings (" ' `), line comments (//), and block comments.
 */
function findMatchingBrace(content, startIndex) {
  let depth = 1;
  let i = startIndex + 1;
  let inString = null; // '"' | "'" | '`' | null
  const n = content.length;
  while (i < n && depth > 0) {
    const c = content[i];
    if (inString) {
      if (c === '\\') {
        i += 2;
        continue;
      }
      if (c === inString) {
        inString = null;
      }
      i++;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') {
      inString = c;
      i++;
      continue;
    }
    if (c === '/' && content[i + 1] === '/') {
      i = content.indexOf('\n', i);
      if (i === -1) i = n;
      else i++;
      continue;
    }
    if (c === '/' && content[i + 1] === '*') {
      const end = content.indexOf('*/', i + 2);
      if (end === -1) return -1;
      i = end + 2;
      continue;
    }
    if (c === '{') {
      depth++;
    } else if (c === '}') {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Extract the where: { ... } block from the method call argument starting at argStart.
 * Returns { whereContent: string | null, parseError: 'missing-where' | null }.
 */
function extractWhereBlock(content, argStart) {
  const close = findMatchingBrace(content, argStart);
  if (close === -1) return { whereContent: null, parseError: 'missing-where' };
  const argObj = content.slice(argStart, close + 1);
  const whereMatch = argObj.match(/\bwhere\s*:\s*\{/);
  if (!whereMatch) return { whereContent: null, parseError: 'missing-where' };
  const innerStart = argStart + (whereMatch.index + whereMatch[0].length - 1);
  const innerClose = findMatchingBrace(content, innerStart);
  if (innerClose === -1) return { whereContent: null, parseError: 'missing-where' };
  const whereContent = content.slice(innerStart, innerClose + 1);
  return { whereContent, parseError: null };
}

// Match tenantId as object key: "tenantId: value", shorthand "tenantId }"/"tenantId,", or "tenantId // comment"
const TENANT_ID_KEY_RE = /\btenantId\s*(?:[:,\}]|\/\/)/;

// Prisma logical operators OR/AND/NOT: tenantId in one branch does not guarantee scope for all paths.
// Ban any where that uses these (conscious tradeoff: no full AST "tenantId in every branch" analysis).
// Match only as object keys (after { or ,) to avoid false positive on string values like label: "OR: ...".
const LOGICAL_OPERATORS_RE = /(?:^|[{,])\s*(?:OR|AND|NOT)\s*:/;

function hasLogicalOperators(whereContent) {
  return LOGICAL_OPERATORS_RE.test(whereContent);
}

function hasTenantScope(whereContent) {
  if (hasLogicalOperators(whereContent)) return false;
  if (TENANT_ID_KEY_RE.test(whereContent)) return true;
  for (const ck of COMPOUND_KEYS) {
    if (whereContent.includes(ck)) return true;
  }
  return false;
}

function checkFile(filePath, relPath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const violations = [];
  let match;
  CLIENT_RE.lastIndex = 0;
  while ((match = CLIENT_RE.exec(content)) !== null) {
    const model = match[1];
    if (!TENANT_MODELS.has(model)) continue;
    const method = match[2];
    // Use the { that is part of this regex match (avoids parsing wrong brace from comment/string)
    const argStart = match.index + match[0].length - 1;
    const lineNum = content.slice(0, match.index).split('\n').length;
    const { whereContent, parseError } = extractWhereBlock(content, argStart);
    if (parseError === 'missing-where') {
      violations.push({
        rel: relPath,
        line: lineNum,
        model,
        method,
        rule: 'cannot-parse/missing-where'
      });
      continue;
    }
    if (UNSAFE_METHODS.includes(method)) {
      if (!hasTenantScope(whereContent)) {
        violations.push({
          rel: relPath,
          line: lineNum,
          model,
          method,
          rule: 'findUnique/update/delete require tenantId or compound key in where'
        });
      }
    } else if (MANY_METHODS.includes(method)) {
      if (!TENANT_ID_KEY_RE.test(whereContent)) {
        violations.push({
          rel: relPath,
          line: lineNum,
          model,
          method,
          rule: 'findFirst/findMany/updateMany/deleteMany require tenantId in where'
        });
      }
    }
  }
  return violations;
}

function main() {
  const base = path.relative(process.cwd(), SRC_ROOT) || 'src';
  const files = getScopeFiles();
  const all = [];
  for (const { full, rel } of files) {
    const v = checkFile(full, rel);
    all.push(...v);
  }
  if (all.length > 0) {
    console.error('check-tenant-prisma: forbidden Prisma usage in tenant-scoped code (scope: domains/storefront|admin|auth, services minus resolver|cache-warmer|cron)\n');
    for (const v of all) {
      console.error(`  ${v.rel}:${v.line}  ${v.model}.${v.method}  — ${v.rule}`);
    }
    process.exit(1);
  }
  console.log('check-tenant-prisma: ok (no unsafe tenant Prisma usage in scope)');
}

// Export for unit tests; run main only when executed directly
export { hasTenantScope, hasLogicalOperators };

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  main();
}
