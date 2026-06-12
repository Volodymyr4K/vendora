#!/usr/bin/env node
/**
 * Self-check for guardrails - validates that rules actually catch violations
 * Run with: node scripts/guardrails/themes-self-check.mjs
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '../..');

let passed = 0;
let failed = 0;

function test(name, fn) {
    try {
        fn();
        console.log(`✅ ${name}`);
        passed++;
    } catch (err) {
        console.error(`❌ ${name}: ${err.message}`);
        failed++;
    }
}

console.log('🧪 Running guardrails self-check...\\n');

// Test 1: Web - /config reference should be caught
test('Web: catches "/config" (double quotes)', () => {
    const testFile = join(REPO_ROOT, 'apps/web/app/_test_guard_double.ts');
    writeFileSync(testFile, 'const url = "/config";');

    try {
        execSync('node scripts/guardrails/themes-web.mjs', { cwd: REPO_ROOT });
        throw new Error('Guardrail should have failed but passed');
    } catch (err) {
        if (err.message.includes('should have failed')) throw err;
        // Expected to fail - success!
    } finally {
        try { execSync(`rm ${testFile}`); } catch { }
    }
});

// Test 2: Web - '/config' single quotes should be caught
test("Web: catches '/config' (single quotes)", () => {
    const testFile = join(REPO_ROOT, 'apps/web/app/_test_guard_single.ts');
    writeFileSync(testFile, "const url = '/config';");

    try {
        execSync('node scripts/guardrails/themes-web.mjs', { cwd: REPO_ROOT });
        throw new Error('Guardrail should have failed but passed');
    } catch (err) {
        if (err.message.includes('should have failed')) throw err;
    } finally {
        try { execSync(`rm ${testFile}`); } catch { }
    }
});

// Test 3: BFF - prisma.tenant in config.routes.ts should be caught
test('BFF: catches prisma.tenant in config.routes.ts', () => {
    const configFile = join(REPO_ROOT, 'apps/bff/src/domains/storefront/config.routes.ts');

    if (!existsSync(configFile)) {
        throw new Error('config.routes.ts does not exist - cannot test');
    }

    const original = readFileSync(configFile, 'utf8');
    const modified = original + '\\n// TEST: await prisma.tenant.findFirst();';

    writeFileSync(configFile, modified);

    try {
        execSync('node scripts/guardrails/themes-bff.mjs', { cwd: REPO_ROOT });
        throw new Error('Guardrail should have failed but passed');
    } catch (err) {
        if (err.message.includes('should have failed')) throw err;
    } finally {
        writeFileSync(configFile, original);
    }
});

// Test 4: BFF - deps.prisma.tenant pattern
test('BFF: catches deps.prisma.tenant pattern', () => {
    const branchesFile = join(REPO_ROOT, 'apps/bff/src/domains/storefront/places/branches.routes.ts');

    if (!existsSync(branchesFile)) {
        throw new Error('branches.routes.ts does not exist - cannot test');
    }

    const original = readFileSync(branchesFile, 'utf8');
    const modified = original + '\\n// TEST: const t = deps.prisma.tenant.findFirst();';

    writeFileSync(branchesFile, modified);

    try {
        execSync('node scripts/guardrails/themes-bff.mjs', { cwd: REPO_ROOT });
        throw new Error('Guardrail should have failed but passed');
    } catch (err) {
        if (err.message.includes('should have failed')) throw err;
    } finally {
        writeFileSync(branchesFile, original);
    }
});

console.log(`\\n📊 Results: ${passed} passed, ${failed} failed`);

if (failed > 0) {
    console.error('\\n❌ Self-check failed - guardrails are not working correctly');
    process.exit(1);
} else {
    console.log('\\n✅ All self-checks passed - guardrails are working correctly');
}

// CRITICAL: Verify repo is clean after all tests
console.log('\n🔍 Verifying repository is clean...');
try {
    execSync('git diff --exit-code', { cwd: REPO_ROOT, encoding: 'utf8' });
    console.log('✅ Repository is clean - no files modified');
} catch (err) {
    console.error('❌ CRITICAL: Repository has uncommitted changes after self-check!');
    console.error('This means cleanup failed. Run `git diff` to see what was left dirty.');
    console.error('\nYou may need to run: git checkout apps/bff/src/domains/storefront/');
    process.exit(1);
}
