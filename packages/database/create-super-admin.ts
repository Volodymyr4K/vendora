import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createSuperAdmin() {
    const email = 'super@admin.com';
    // Сильний пароль: 20 символів, великі/малі літери, цифри, спецсимволи
    const password = 'SuperAdm1n@2024!Secure';

    console.log('\n🔐 Creating SUPER_ADMIN user...');
    console.log('📧 Email:', email);
    console.log('🔑 Password:', password);
    console.log('\n⚠️  IMPORTANT: Save this password securely!\n');

    // Hash password with bcrypt (10 rounds)
    const hashedPassword = await bcrypt.hash(password, 10);

    try {
        // Check if user already exists
        const existing = await prisma.user.findUnique({
            where: { email }
        });

        if (existing) {
            console.log('❌ User with this email already exists!');
            console.log('   Deleting old user and creating new one...\n');
            await prisma.user.delete({ where: { email } });
        }

        // Create super-admin user WITHOUT tenantId
        const user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                role: 'SUPER_ADMIN',
                // NO tenantId - super admins work across all tenants
            }
        });

        console.log('✅ SUPER_ADMIN user created successfully!');
        console.log('\n📋 User Details:');
        console.log('   ID:', user.id);
        console.log('   Email:', user.email);
        console.log('   Role:', user.role);
        console.log('   TenantId:', user.tenantId || 'null (cross-tenant access)');
        console.log('\n🌐 Login at: http://localhost:3000/super-admin/login');
        console.log('📧 Email:', email);
        console.log('🔑 Password:', password);

    } catch (error: unknown) {
        const e = error as { code?: string };
        if (e.code === 'P2003') {
            console.error('\n❌ Error: Cannot create user without tenantId due to foreign key constraint');
            console.error('   Need to modify User schema to make tenantId optional\n');
        } else {
            console.error('❌ Error creating user:', error);
        }
    } finally {
        await prisma.$disconnect();
    }
}

createSuperAdmin().catch(console.error);
