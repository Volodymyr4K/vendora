import { prisma } from "@vendora/database";

const slug = process.argv[2] ?? "vendora-sushi-hq";
const value = process.argv[3] ?? "minimal"; // minimal | default | remove

const row = await prisma.tenant.findUnique({
    where: { slug },
    select: { settings: true },
});
if (!row) throw new Error(`Tenant not found: ${slug}`);

const settings = row.settings ?? {};
const theme = settings.theme ?? {};

let nextTheme;
if (value === "remove") {
    const { componentSet, ...rest } = theme;
    nextTheme = rest;
} else {
    nextTheme = { ...theme, version: 1, componentSet: value };
}

await prisma.tenant.update({
    where: { slug },
    data: { settings: { ...settings, theme: nextTheme } },
});

const after = await prisma.tenant.findUnique({
    where: { slug },
    select: { settings: true },
});
console.log(JSON.stringify(after?.settings, null, 2));

await prisma.$disconnect();
