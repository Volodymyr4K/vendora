import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function checkSuperAdmin() {
    const users = await prisma.user.findMany({
        select: {
            email: true,
            role: true,
            tenantId: true,
        }
    });

    console.log('\n=== All Users in DB ===');
    console.table(users);

    const superAdmins = users.filter(u => u.role === 'SUPER_ADMIN');

    if (superAdmins.length > 0) {
        console.log('\n✅ SUPER_ADMIN users found:');
        console.table(superAdmins);
        console.log('\n📧 Login with one of these emails');
        console.log('🔑 Password: Check with your team or reset if needed');
    } else {
        console.log('\n⚠️  No SUPER_ADMIN users found in database');
        console.log('\nYou can create one with:');
        console.log('  Email: admin@example.com');
        console.log('  Password: (will need to hash and insert)');
    }

    await prisma.$disconnect();
}

checkSuperAdmin().catch(console.error);
