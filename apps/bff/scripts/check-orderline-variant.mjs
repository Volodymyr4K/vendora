#!/usr/bin/env node
/**
 * Phase 4.4 gate: forbid reading OrderLine.variantId and OrderLine.variant in business logic.
 * Canonical reference for price/availability/reports is offerId only.
 *
 * Rule: No file in apps/bff/src (excluding __tests__) may reference both
 * orderLine/orderLines and (variantId OR relation "variant"), except allowed write-path files.
 * Catches: variantId, orderLine.variant, include: { variant }, select: { variant }.
 *
 * Allowed: checkout.routes.ts (write path only — orderLine.create with variantId snapshot).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC_ROOT = path.resolve(__dirname, '..', 'src');

const ALLOWED_FILES = new Set([
  'checkout.routes.ts',   // write path: orderLine.create with variantId snapshot only
]);

function findTsFiles(dir, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    const rel = path.relative(SRC_ROOT, full).replace(/\\/g, '/');
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'node_modules') continue;
      findTsFiles(full, out);
    } else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
  return out;
}

function main() {
  const files = findTsFiles(SRC_ROOT);
  const violations = [];

  for (const rel of files) {
    const base = path.basename(rel);
    if (ALLOWED_FILES.has(base)) continue;

    const content = fs.readFileSync(path.join(SRC_ROOT, rel), 'utf8');
    const hasOrderLine = /\borderLine\b|\borderLines\b/.test(content);
    const hasVariantId = /\bvariantId\b/.test(content);
    // Relation "variant" on OrderLine: .variant, include: { variant }, select: { variant }
    const hasVariantRelation = /\.variant\b|variant:\s*true|variant:\s*\{|include:.*variant|select:.*variant/.test(content);

    if (hasOrderLine && (hasVariantId || hasVariantRelation)) {
      violations.push(rel);
    }
  }

  if (violations.length > 0) {
    console.error('check-orderline-variant: OrderLine.variantId and OrderLine.variant must not be read in business logic (Phase 4.4); use offerId.');
    console.error('Files that reference orderLine/orderLines and (variantId or relation variant) (excluding allowed write-path):');
    violations.forEach(f => console.error('  ', f));
    process.exit(1);
  }

  console.log('check-orderline-variant: ok (no OrderLine.variantId/variant read in scope)');
}

main();
