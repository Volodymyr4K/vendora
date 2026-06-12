import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function run() {
    const email = "admin@vendora.com";
    const plainPassword = "admin";

    const tenant = await prisma.tenant.findUnique({ where: { slug: "vendora-sushi-hq" } });
    if (!tenant) throw new Error("Tenant 'vendora-sushi-hq' not found. Run backfill first.");

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
        console.log("User already exists:", existing.id);
        return;
    }

    // SECURITY FIX: Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(plainPassword, 10);

    const user = await prisma.user.create({
        data: {
            email,
            password: hashedPassword,
            role: "admin",
            tenantId: tenant.id
        }
    });

    console.log("Created User:", user);
}

run()
    .catch(console.error)
    .finally(() => prisma.$disconnect());
