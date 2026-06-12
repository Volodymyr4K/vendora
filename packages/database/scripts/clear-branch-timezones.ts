/// <reference types="node" />
import { PrismaClient } from '@prisma/client';

// SAFETY GATES
if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Cannot run cleanup script in production!');
    process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('❌ FATAL: DATABASE_URL is missing!');
    process.exit(1);
}

try {
    const { URL } = await import('node:url');
    const parsed = new URL(dbUrl);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        console.error(`❌ FATAL: Refusing to run on non-local DB host: ${parsed.hostname}`);
        process.exit(1);
    }
} catch (e) {
    console.error('❌ FATAL: Invalid DATABASE_URL format.');
    process.exit(1);
}

const prisma = new PrismaClient();

async function run() {
    console.log('[clear-branch-timezones] Starting cleanup...');

    try {
        const result = await prisma.branch.updateMany({
            data: { timezone: null }
        });

        console.log(`✅ Successfully cleared timezone for ${result.count} branch(es).`);
    } catch (e) {
        console.error('❌ Failed to clear branch timezones:', e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
    } finally {
        await prisma.$disconnect();
    }
}

run();
