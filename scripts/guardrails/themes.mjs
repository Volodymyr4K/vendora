#!/usr/bin/env node
/**
 * Themes per tenant - guardrails aggregator
 * Runs all theme-related guardrail checks
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const scripts = [
    join(__dirname, 'themes-web.mjs'),
    join(__dirname, 'themes-bff.mjs')
];

let failed = false;

async function runScript(scriptPath) {
    return new Promise((resolve) => {
        const proc = spawn('node', [scriptPath], {
            stdio: 'inherit',
            cwd: join(__dirname, '../..')
        });

        proc.on('close', (code) => {
            if (code !== 0) {
                failed = true;
            }
            resolve();
        });
    });
}

async function main() {
    console.log('🚀 Running all theme guardrails...\n');

    for (const script of scripts) {
        await runScript(script);
        console.log('');
    }

    if (failed) {
        console.error('❌ Some guardrails failed');
        process.exit(1);
    } else {
        console.log('✅ All theme guardrails passed');
    }
}

main();
