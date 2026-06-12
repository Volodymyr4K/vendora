import { beforeAll, afterAll, afterEach } from 'vitest';
import { prisma } from '@vendora/database';

// Global test setup
beforeAll(async () => {
    console.log('🧪 Starting test suite...');
});

afterAll(async () => {
    // Cleanup database connections
    await prisma.$disconnect();
    console.log('✅ Test suite completed');
});

// Clean up after each test
afterEach(async () => {
    // Optional: Clean up test data
    // await cleanupTestData();
});
