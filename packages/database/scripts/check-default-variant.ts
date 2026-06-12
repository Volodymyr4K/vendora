/**
 * Phase 2.1: Invariant check — every CatalogItem must have exactly one default ItemVariant.
 * Fails (exit 1) if any item has 0 or >1 default variant.
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function run() {
    const items = await prisma.catalogItem.findMany({
        select: { id: true, slug: true, tenantId: true },
        where: {}
    });

    let missing = 0;
    let multiple = 0;

    for (const item of items) {
        const defaultCount = await prisma.itemVariant.count({
            where: { catalogItemId: item.id, tenantId: item.tenantId, isDefault: true }
        });
        if (defaultCount === 0) {
            missing++;
            console.error(`[check-default-variant] Item ${item.slug} (${item.id}) has no default variant`);
        } else if (defaultCount > 1) {
            multiple++;
            console.error(`[check-default-variant] Item ${item.slug} (${item.id}) has ${defaultCount} default variants`);
        }
    }

    if (missing > 0 || multiple > 0) {
        console.error(`[check-default-variant] FAIL: ${missing} items without default, ${multiple} items with >1 default`);
        process.exit(1);
    }
    console.log(`[check-default-variant] OK: all ${items.length} items have exactly one default variant`);
}

run()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
