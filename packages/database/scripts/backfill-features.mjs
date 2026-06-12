#!/usr/bin/env node
/**
 * Migration: Backfill Tenant Features
 * Run: node packages/database/scripts/backfill-features.mjs
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('🔍 Phase 7: Backfilling Tenant Features\n');

    // Step 1: Check current state
    console.log('Step 1: Checking current state...');
    const tenants = await prisma.tenant.findMany({
        select: {
            id: true,
            name: true,
            slug: true,
            features: true,
        },
    });

    const stats = {
        total: tenants.length,
        withNull: tenants.filter(t => t.features === null).length,
        withEmpty: tenants.filter(t => JSON.stringify(t.features) === '{}').length,
        withoutModules: tenants.filter(t => {
            if (!t.features) return true;
            return !t.features.modules;
        }).length,
    };

    console.log(`  Total tenants: ${stats.total}`);
    console.log(`  With NULL features: ${stats.withNull}`);
    console.log(`  With empty {} features: ${stats.withEmpty}`);
    console.log(`  Without modules: ${stats.withoutModules}\n`);

    if (stats.withNull === 0 && stats.withEmpty === 0 && stats.withoutModules === 0) {
        console.log('✅ All tenants already have proper feature structure. No migration needed.\n');
        return;
    }

    // Step 2: Backfill
    console.log('Step 2: Backfilling features...');

    const defaultFeatures = {
        version: 1,
        modules: {
            profile: true,
            ordering: true,
            delivery: true,
        },
    };

    const tenantsToUpdate = tenants.filter(t => {
        if (!t.features) return true;
        return !t.features.modules;
    });

    console.log(`  Updating ${tenantsToUpdate.length} tenants...`);

    for (const tenant of tenantsToUpdate) {
        await prisma.tenant.update({
            where: { id: tenant.id },
            data: { features: defaultFeatures },
        });
        console.log(`  ✓ Updated: ${tenant.slug} (${tenant.name})`);
    }

    // Step 3: Verify
    console.log('\nStep 3: Verifying migration...');
    const updatedTenants = await prisma.tenant.findMany({
        select: {
            id: true,
            name: true,
            slug: true,
            features: true,
        },
    });

    const afterStats = {
        withNull: updatedTenants.filter(t => t.features === null).length,
        withEmpty: updatedTenants.filter(t => JSON.stringify(t.features) === '{}').length,
        withoutModules: updatedTenants.filter(t => {
            if (!t.features) return true;
            return !t.features.modules;
        }).length,
    };

    console.log(`  Tenants with NULL features: ${afterStats.withNull}`);
    console.log(`  Tenants with empty {} features: ${afterStats.withEmpty}`);
    console.log(`  Tenants without modules: ${afterStats.withoutModules}\n`);

    if (afterStats.withNull === 0 && afterStats.withEmpty === 0 && afterStats.withoutModules === 0) {
        console.log('✅ Migration completed successfully! All tenants have proper feature structure.\n');
    } else {
        console.error('⚠️  Warning: Some tenants still have incomplete features. Manual review needed.\n');
    }

    // Step 4: Sample output
    console.log('Sample tenants (first 5):');
    const sample = updatedTenants.slice(0, 5);
    for (const t of sample) {
        console.log(`  - ${t.slug}: ${JSON.stringify(t.features)}`);
    }
}

main()
    .catch((e) => {
        console.error('❌ Migration failed:', e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
