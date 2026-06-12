#!/usr/bin/env node
/**
 * Guardrails for Web app - themes per tenant
 * Enforces:
 * 1. Fetch allowlist: /config and /branches only in lib/data.ts
 * 2. No tags/revalidate for /config and /branches
 * 3. themeToCssVars server-only enforcement
 */

import { readFileSync, existsSync } from 'fs';
import { join, relative } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const REPO_ROOT = join(__dirname, '../..');
const WEB_APP = join(REPO_ROOT, 'apps/web');

let errors = 0;

function error(msg) {
    console.error(`❌ ${msg}`);
    errors++;
}

async function checkFetchAllowlist() {
    console.log('📋 Checking /config and /branches references outside lib/data.ts...');

    const { execSync } = await import('child_process');
    const violations = [];

    try {
        // Search for each quote type separately (avoids shell escaping hell)
        const patterns = [
            '"/config"',
            "'/config'",
            '`/config`',
            '"/branches"',
            "'/branches'",
            '`/branches`'
        ];

        for (const pattern of patterns) {
            try {
                const result = execSync(
                    `grep -r -n --include="*.ts" --include="*.tsx" --exclude-dir="tests" --exclude-dir=".next" --exclude="*.test.*" --exclude="*.spec.*" --exclude="vitest.config.*" -F '${pattern}' apps/web || true`,
                    { cwd: REPO_ROOT, encoding: 'utf8' }
                );

                if (result.trim()) {
                    violations.push(result.trim());
                }
            } catch (err) {
                // grep returns non-zero if no matches
            }
        }

        if (violations.length > 0) {
            const lines = violations.flatMap(v => v.split('\n'));
            for (const line of lines) {
                // Extract file path and line content
                const parts = line.split(':');
                if (parts.length < 3) continue;

                const filePath = parts[0];
                const lineNum = parts[1];
                const lineContent = parts.slice(2).join(':');

                // Skip /super/ paths
                if (filePath.includes('/super/')) continue;

                // Skip line comments (start with //)
                if (lineContent.trim().startsWith('//')) continue;

                // Skip block comments (simple heuristic)
                if (lineContent.includes('/*') || lineContent.includes('*/')) continue;

                // Skip comments in JSDoc
                if (lineContent.trim().startsWith('*')) continue;

                // Skip error messages and console logs
                if (lineContent.includes('throw new Error') ||
                    lineContent.includes('console.log') ||
                    lineContent.includes('console.error') ||
                    lineContent.includes('console.warn')) continue;

                // Skip super-admin UI paths (e.g., /super-admin/tenants/{id}/branches)
                if (lineContent.includes('/super-admin/')) continue;
                if (lineContent.includes('/admin/')) continue;

                // Skip super-admin API paths (e.g., ${BFF}/super/tenants/${id}/branches)
                if (lineContent.includes('/super/')) continue;


                const relativePath = relative(REPO_ROOT, filePath);

                // STRICT Allowlist - prevent bypass holes:
                // 1. lib/data.ts - ONLY place for fetch("/config") or fetch("/branches")
                if (relativePath.includes('lib/data.ts')) {
                    continue;
                }

                // 2. mutations.ts and actions.ts - ONLY for revalidatePath("/config"), NOT fetch
                //    Check that line contains revalidatePath/revalidateTag (cache invalidation)
                if (relativePath.includes('lib/server/mutations.ts') || relativePath.includes('app/actions.ts')) {
                    if (lineContent.includes('revalidatePath') || lineContent.includes('revalidateTag')) {
                        continue; // Legitimate cache invalidation
                    }
                    // If no revalidate context, this is a violation (e.g., fetch or other use)
                }

                error(`Reference to /config or /branches found outside allowlist: ${relativePath}:${lineNum}`);
            }
        }
    } catch (err) {
        // Unexpected error
        console.error('Error in checkFetchAllowlist:', err.message);
    }
}

async function checkNoTagsRevalidate() {
    console.log('📋 Checking no tags/revalidate for /config and /branches...');

    const { execSync } = await import('child_process');

    try {
        // Search for next: { tags } near config/branches
        const grepTags = execSync(
            `grep -r -n --include="*.ts" --include="*.tsx" -B 3 -A 3 -E 'next:\\s*\\{\\s*tags' apps/web | grep -E '/(config|branches)' || true`,
            { cwd: REPO_ROOT, encoding: 'utf8' }
        );

        if (grepTags.trim()) {
            error(`Found 'next: { tags }' near /config or /branches endpoints:\n${grepTags}`);
        }

        // Search for revalidateTag (uncommented) near config/branches
        const grepRevalidate = execSync(
            `grep -r -n --include="*.ts" --include="*.tsx" -v '^[[:space:]]*//' 'revalidateTag' apps/web | grep -v '^[[:space:]]*/\\*' || true`,
            { cwd: REPO_ROOT, encoding: 'utf8' }
        );

        if (grepRevalidate.trim()) {
            const lines = grepRevalidate.trim().split('\n');
            for (const line of lines) {
                // Check if this file also mentions config or branches
                const match = line.match(/^([^:]+):/);
                if (match) {
                    const filePath = match[1];
                    const content = readFileSync(join(REPO_ROOT, filePath), 'utf8');
                    if (content.includes('/config') || content.includes('/branches')) {
                        error(`Found revalidateTag in file that handles /config or /branches: ${filePath}`);
                    }
                }
            }
        }
    } catch (err) {
        // grep returns non-zero if no matches
    }
}

async function checkThemeToCssVarsServerOnly() {
    console.log('📋 Checking themeToCssVars is server-only...');

    const SERVER_TS = join(WEB_APP, 'lib/theme/server.ts');

    // 1. Check server.ts EXISTS (after Phase 1.8)
    if (!existsSync(SERVER_TS)) {
        error(`lib/theme/server.ts does not exist (required after Phase 1.8)`);
        return; // Cannot continue checks
    }

    // 2. Check server.ts has "server-only" import
    const content = readFileSync(SERVER_TS, 'utf8');
    if (!content.includes('server-only')) {
        error(`lib/theme/server.ts must import "server-only"`);
    }

    // 3. Check no client files import lib/theme/server
    const { execSync } = await import('child_process');

    try {
        const grepClientImports = execSync(
            `grep -r -n --include="*.tsx" --include="*.ts" '"use client"' apps/web || true`,
            { cwd: REPO_ROOT, encoding: 'utf8' }
        );

        if (grepClientImports.trim()) {
            const clientFiles = grepClientImports.trim().split('\n').map(l => l.split(':')[0]);

            for (const file of clientFiles) {
                const content = readFileSync(join(REPO_ROOT, file), 'utf8');
                if (content.includes('@/lib/theme/server') || content.includes('./lib/theme/server') || content.includes('../lib/theme/server')) {
                    error(`Client file imports lib/theme/server: ${file}`);
                }
            }
        }
    } catch (err) {
        // grep returns non-zero if no matches
    }
}

async function main() {
    console.log('🔍 Running Web guardrails for themes...\n');

    await checkFetchAllowlist();
    checkNoTagsRevalidate();
    await checkThemeToCssVarsServerOnly();

    if (errors > 0) {
        console.error(`\n❌ Web guardrails failed with ${errors} error(s)`);
        process.exit(1);
    } else {
        console.log('\n✅ All Web guardrails passed');
    }
}

main();
