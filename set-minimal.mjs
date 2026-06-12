import { prisma } from '@vendora/database';

const slug = 'vendora-sushi-hq';

const row = await prisma.tenant.findUnique({ where: { slug }, select: { settings: true } });
if (!row) throw new Error(`Tenant not found: ${slug}`);

const settings = (row.settings ?? {});
const theme = (settings.theme ?? {});
const next = {
    ...settings,
    theme: {
        ...theme,
        version: 1,
        componentSet: 'minimal',
    },
};

await prisma.tenant.update({ where: { slug }, data: { settings: next } });

const after = await prisma.tenant.findUnique({ where: { slug }, select: { settings: true } });
console.log(JSON.stringify(after?.settings, null, 2));

await prisma.$disconnect();
