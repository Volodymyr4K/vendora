#!/usr/bin/env node
/**
 * Test for BFF guardrails alias bypass detection
 * Validates that destructuring patterns are caught
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

console.log('🧪 Testing BFF alias bypass detection...\\n');

const configFile = join(REPO_ROOT, 'apps/bff/src/domains/storefront/config.routes.ts');

if (!existsSync(configFile)) {
    console.error('❌ config.routes.ts does not exist');
    process.exit(1);
}

const original = readFileSync(configFile, 'utf8');

// Test patterns that should be caught
const testPatterns = [
    { name: 'Destructuring', code: '\\n// TEST: const { tenant } = prisma;' },
    { name: 'Assignment', code: '\\n// TEST: const t = prisma.tenant;' },
    { name: 'Nested destructuring', code: '\\n// TEST: const { tenant } = deps.prisma;' }
];

let passed = 0;
let failed = 0;

for (const { name, code } of testPatterns) {
    try {
        writeFileSync(configFile, original + code);

        try {
            execSync('node scripts/guardrails/themes-bff.mjs', { cwd: REPO_ROOT, encoding: 'utf8' });
            console.error(`❌ ${name}: Guardrail should have failed but passed`);
            failed++;
        } catch (err) {
            // Expected to fail
            console.log(`✅ ${name}: Correctly caught`);
            passed++;
        }
    } finally {
        writeFileSync(configFile, original);
    }
}

console.log(`\\n📊 Results: ${passed}/${testPatterns.length} passed`);

if (failed > 0) {
    console.error('\\n❌ Some bypass patterns not detected');
    process.exit(1);
} else {
    console.log('\\n✅ All alias bypass patterns correctly detected');
}
