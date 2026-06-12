#!/usr/bin/env node
/**
 * Guardrails for BFF - themes per tenant
 * Enforces:
 * 1. No direct prisma.tenant reads in GET /config and GET /branches routes
 */

import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '../..');
const BFF_ROUTES = join(REPO_ROOT, 'apps/bff/src/routes');

let errors = 0;

function error(msg) {
    console.error(`❌ ${msg}`);
    errors++;
}

async function checkNoPrismaTenantInConfigBranches() {
    console.log('📋 Checking no direct prisma.tenant in GET /config and GET /branches routes...');

    const { execSync } = await import('child_process');

    try {
        // SCOPE: Check ONLY the 2 specific route handlers for /config and /branches endpoints
        // This is intentionally narrow - we forbid prisma.tenant ONLY in these tenant-resolution routes
        // Other routes may use prisma.tenant if needed (e.g., admin routes, internal services)
        const configRoutes = [
            'apps/bff/src/domains/storefront/config.routes.ts',           // GET /config
            'apps/bff/src/domains/storefront/places/branches.routes.ts'   // GET /branches/:branch
        ];

        for (const routeFile of configRoutes) {
            const fullPath = join(REPO_ROOT, routeFile);

            if (existsSync(fullPath)) {
                const content = readFileSync(fullPath, 'utf8');

                // Check for various prisma.tenant access patterns:
                // Direct access:
                // - prisma.tenant
                // - deps.prisma.tenant
                // - ctx.prisma.tenant
                // - prisma['tenant']
                // - <anything>.prisma.tenant
                // Alias/destructuring bypasses:
                // - const { tenant } = prisma
                // - const t = prisma.tenant
                // - = prisma.tenant (assignment)
                const patterns = [
                    /\bprisma\.tenant\b/,
                    /\.prisma\.tenant\b/,
                    /prisma\[['"]tenant['"]\]/,
                    // Destructuring bypass: const { tenant } = prisma
                    /\{\s*tenant\s*\}\s*=\s*prisma/,
                    // Assignment bypass: const x = prisma.tenant or let y = prisma.tenant
                    /=\s*prisma\.tenant\b/,
                    // Destructuring from nested: const { tenant } = deps.prisma
                    /\{\s*tenant\s*\}\s*=.*\.prisma/
                ];

                for (const pattern of patterns) {
                    if (content.match(pattern)) {
                        error(`Found direct prisma.tenant usage (pattern: ${pattern.source}) in ${routeFile}\n` +
                            `  These routes must read tenant from req.tenant only (via tenant-resolver cache)`);
                        break; // Only report once per file
                    }
                }
            }
        }
    } catch (err) {
        console.error('Error checking prisma.tenant usage:', err.message);
    }
}

async function main() {
    console.log('🔍 Running BFF guardrails for themes...\n');

    await checkNoPrismaTenantInConfigBranches();

    if (errors > 0) {
        console.error(`\n❌ BFF guardrails failed with ${errors} error(s)`);
        process.exit(1);
    } else {
        console.log('\n✅ All BFF guardrails passed');
    }
}

main();
