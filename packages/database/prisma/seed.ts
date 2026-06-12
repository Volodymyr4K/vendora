import { prisma } from "../src";
import bcrypt from "bcryptjs";

async function main() {
    console.log("🌱 Seeding multi-tenant development database...");

    // 1. Create Tenant
    const tenant = await prisma.tenant.upsert({
        where: { slug: "vendora-sushi-hq" },
        update: {
            isActive: true, // Ensure tenant stays active on re-seed
        },
        create: {
            slug: "vendora-sushi-hq",
            name: "Vendora Sushi HQ",
            isActive: true, // Active by default
        },
    });
    console.log(`✅ Tenant: ${tenant.name} (${tenant.id}) - Active: ${tenant.isActive}`);

    // 2. Create Admin User with bcrypt-hashed password
    const hashedPassword = await bcrypt.hash("123456", 10);

    const adminUser = await prisma.user.upsert({
        where: { email: "admin@vendora.com" },
        update: {
            password: hashedPassword, // Update password in case it was plaintext
        },
        create: {
            email: "admin@vendora.com",
            password: hashedPassword,
            role: "admin",
            tenantId: tenant.id,
        },
    });
    console.log(`✅ Admin User: ${adminUser.email} (password: 123456)`);

    // ACCESS_LEVELS Phase 1.5: First user = tenant owner (TenantUser with TENANT_OWNER)
    await prisma.tenantUser.upsert({
        where: {
            tenantId_userId: { tenantId: tenant.id, userId: adminUser.id },
        },
        update: { role: "TENANT_OWNER" },
        create: {
            tenantId: tenant.id,
            userId: adminUser.id,
            role: "TENANT_OWNER",
        },
    });
    console.log(`✅ TenantUser: ${adminUser.email} as TENANT_OWNER for ${tenant.name}`);

    // 3. Create Branches (Cities)
    const branchesData = [
        {
            slug: "kyiv-bazhana",
            cityName: "Kyiv",
            address: "17 Mykoly Bazhana Ave",
            phones: ["044 123 4567", "067 123 4567"],
            workingSchedule: {
                mon: [{ start: "10:00", end: "22:00" }],
                tue: [{ start: "10:00", end: "22:00" }],
                wed: [{ start: "10:00", end: "22:00" }],
                thu: [{ start: "10:00", end: "22:00" }],
                fri: [{ start: "10:00", end: "22:00" }],
                sat: [{ start: "10:00", end: "22:00" }],
                sun: [{ start: "10:00", end: "22:00" }],
                overrides: {}
            },
            deliveryFee: 6000, // 60 UAH
            freeFrom: 65000, // 650 UAH
            etaMin: 35,
            etaMax: 55,
            zones: ["Left Bank", "Darnytsia"],
            isActive: true,
            tenantId: tenant.id,
        },
        {
            slug: "lviv-rynok",
            cityName: "Lviv",
            address: "1 Rynok Sq",
            phones: ["032 123 4567", "093 123 4567"],
            workingSchedule: {
                mon: [{ start: "10:00", end: "23:00" }],
                tue: [{ start: "10:00", end: "23:00" }],
                wed: [{ start: "10:00", end: "23:00" }],
                thu: [{ start: "10:00", end: "23:00" }],
                fri: [{ start: "10:00", end: "23:00" }],
                sat: [{ start: "10:00", end: "23:00" }],
                sun: [{ start: "10:00", end: "23:00" }],
                overrides: {}
            },
            deliveryFee: 5500, // 55 UAH
            freeFrom: 60000, // 600 UAH
            etaMin: 40,
            etaMax: 65,
            zones: ["Center", "Sykhiv"],
            isActive: true,
            tenantId: tenant.id,
        },
        {
            slug: "odesa-arkadia",
            cityName: "Odesa",
            address: "1 Arcadia Alley",
            phones: ["048 123 4567", "050 123 4567"],
            workingSchedule: {
                mon: [{ start: "11:00", end: "00:00" }],
                tue: [{ start: "11:00", end: "00:00" }],
                wed: [{ start: "11:00", end: "00:00" }],
                thu: [{ start: "11:00", end: "00:00" }],
                fri: [{ start: "11:00", end: "00:00" }],
                sat: [{ start: "11:00", end: "00:00" }],
                sun: [{ start: "11:00", end: "00:00" }],
                overrides: {}
            },
            deliveryFee: 7000, // 70 UAH
            freeFrom: 70000, // 700 UAH
            etaMin: 45,
            etaMax: 75,
            zones: ["Arcadia", "Prymorskyi"],
            isActive: true,
            tenantId: tenant.id,
        },
    ];

    for (const branchData of branchesData) {
        await prisma.branch.upsert({
            where: {
                slug_tenantId: {
                    slug: branchData.slug,
                    tenantId: tenant.id
                }
            },
            update: branchData,
            create: branchData,
        });
    }

    const allBranches = await prisma.branch.findMany({
        where: { tenantId: tenant.id },
        select: { id: true },
        orderBy: { id: "asc" },
    });

    const defaultBranchId = allBranches[0]?.id ?? null;
    const branchesMode = allBranches.length <= 1 ? "SINGLE" : "MULTI";

    await prisma.tenant.update({
        where: { id: tenant.id },
        data: {
            branchesMode,
            defaultBranchId,
        },
    });
    console.log(`✅ Branches: ${branchesData.length} (kyiv-bazhana, lviv-rynok, odesa-arkadia)`);

    // 4. Create Categories
    const categoriesData = [
        { slug: "sushi", title: "Sushi", sortOrder: 1 },
        { slug: "rolls", title: "Rolls", sortOrder: 2 },
        { slug: "sets", title: "Sets", sortOrder: 3 },
        { slug: "dishes", title: "Dishes", sortOrder: 4 },
        { slug: "drinks", title: "Drinks", sortOrder: 5 },
    ];

    const categories = [];
    for (const catData of categoriesData) {
        const category = await prisma.category.upsert({
            where: {
                slug_tenantId: {
                    slug: catData.slug,
                    tenantId: tenant.id
                }
            },
            update: {
                title: catData.title,
                sortOrder: catData.sortOrder,
                isAvailable: true,
            },
            create: {
                slug: catData.slug,
                title: catData.title,
                sortOrder: catData.sortOrder,
                isAvailable: true,
                tenantId: tenant.id,
            },
        });
        categories.push(category);
    }
    console.log(`✅ Categories: ${categories.length}`);

    // 4b. Link categories to branches (CategoryBranch)
    const branches = await prisma.branch.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    for (const cat of categories) {
        for (const branch of branches) {
            await prisma.categoryBranch.upsert({
                where: {
                    tenantId_categoryId_branchId: {
                        tenantId: tenant.id,
                        categoryId: cat.id,
                        branchId: branch.id
                    }
                },
                update: {},
                create: {
                    tenantId: tenant.id,
                    categoryId: cat.id,
                    branchId: branch.id
                }
            });
        }
    }
    console.log(`✅ CategoryBranch: ${categories.length * branches.length} links`);

    // 5. Create CatalogItems (Phase 1.3: was Products)
    const catalogItemsData = [
        // Sushi
        {
            slug: "nigiri-salmon",
            cat: "sushi",
            title: "Salmon Nigiri",
            price: 6500,
            weightG: 35,
            imageUrl: "/demo/sushi/nigiri-salmon.svg",
            desc: "Fresh salmon on rice"
        },
        {
            slug: "nigiri-tuna",
            cat: "sushi",
            title: "Tuna Nigiri",
            price: 7500,
            weightG: 35,
            imageUrl: "/demo/sushi/nigiri-tuna.svg",
            desc: "Fresh tuna on rice"
        },

        // Rolls
        {
            slug: "philadelphia",
            cat: "rolls",
            title: "Philadelphia",
            price: 24500,
            weightG: 280,
            desc: "Salmon, Philadelphia cheese, cucumber",
            imageUrl: "/demo/rolls/philadelphia.svg"
        },
        {
            slug: "california",
            cat: "rolls",
            title: "California",
            price: 21000,
            weightG: 260,
            desc: "Crab, tobiko caviar, avocado",
            imageUrl: "/demo/rolls/california.svg"
        },
        {
            slug: "dragon",
            cat: "rolls",
            title: "Green Dragon",
            price: 28000,
            weightG: 290,
            desc: "Eel, avocado, unagi sauce",
            imageUrl: "/demo/rolls/dragon.svg"
        },
        {
            slug: "spicy-tuna",
            cat: "rolls",
            title: "Spicy Tuna",
            price: 23000,
            weightG: 250,
            desc: "Tuna, spicy sauce, cucumber",
            imageUrl: "/demo/rolls/spicy-tuna.svg"
        },
        {
            slug: "veggie",
            cat: "rolls",
            title: "Veggie",
            price: 18000,
            weightG: 220,
            desc: "Cucumber, bell pepper, lettuce",
            imageUrl: "/demo/rolls/cucumber.svg"
        },

        // Sets
        {
            slug: "set-classic",
            cat: "sets",
            title: "Classic Set",
            price: 85000,
            weightG: 950,
            desc: "Philadelphia, California, Maki",
            imageUrl: "/demo/sets/classic.svg"
        },
        {
            slug: "set-family",
            cat: "sets",
            title: "Family Set",
            price: 120000,
            weightG: 1400,
            desc: "5 different rolls for the whole family",
            imageUrl: "/demo/sets/family.svg"
        },
        {
            slug: "set-weekend",
            cat: "sets",
            title: "Weekend Set",
            price: 155000,
            weightG: 1800,
            desc: "A big set for a party",
            imageUrl: "/demo/sets/weekend.svg"
        },

        // Dishes
        {
            slug: "wok-chicken",
            cat: "dishes",
            title: "Chicken WOK",
            price: 16500,
            weightG: 350,
            imageUrl: "/demo/wok/teriyaki.svg",
            desc: "Chicken with vegetables in teriyaki sauce"
        },
        {
            slug: "wok-veggie",
            cat: "dishes",
            title: "Veggie WOK",
            price: 14000,
            weightG: 320,
            imageUrl: "/demo/wok/veggie.svg",
            desc: "Assorted vegetables with soy sauce"
        },
        {
            slug: "wok-shrimp",
            cat: "dishes",
            title: "Shrimp WOK",
            price: 21500,
            weightG: 330,
            imageUrl: "/demo/wok/shrimp.svg",
            desc: "Shrimp with vegetables and garlic"
        },

        // Drinks
        {
            slug: "cola-05",
            cat: "drinks",
            title: "Coca-Cola 0.5",
            price: 4000,
            imageUrl: "/demo/drinks/cola.svg",
            desc: "Classic cola"
        },
        {
            slug: "matcha-latte",
            cat: "drinks",
            title: "Matcha Latte",
            price: 8500,
            imageUrl: "/demo/drinks/matcha.svg",
            desc: "Japanese green tea with milk"
        },
        {
            slug: "water-05",
            cat: "drinks",
            title: "Water 0.5",
            price: 3000,
            imageUrl: "/demo/drinks/water.svg",
            desc: "Mineral water"
        },
    ];

    let catalogItemsCreated = 0;
    for (const itemData of catalogItemsData) {
        const category = categories.find(c => c.slug === itemData.cat);
        if (!category) {
            console.warn(`⚠️  Category "${itemData.cat}" not found for item "${itemData.title}"`);
            continue;
        }

        await prisma.catalogItem.upsert({
            where: {
                slug_tenantId: {
                    slug: itemData.slug,
                    tenantId: tenant.id
                }
            },
            update: {
                title: itemData.title,
                categoryId: category.id,
                basePriceCents: itemData.price,
                weightG: itemData.weightG,
                imageUrl: itemData.imageUrl,
                desc: itemData.desc,
                baseType: "GOOD",
                status: "ACTIVE",
            },
            create: {
                slug: itemData.slug,
                title: itemData.title,
                categoryId: category.id,
                basePriceCents: itemData.price,
                weightG: itemData.weightG,
                imageUrl: itemData.imageUrl,
                desc: itemData.desc,
                baseType: "GOOD",
                status: "ACTIVE",
                tenantId: tenant.id,
            },
        });
        catalogItemsCreated++;
    }
    console.log(`✅ CatalogItems: ${catalogItemsCreated}`);

    // Phase 2.1: One default ItemVariant per CatalogItem
    const allItems = await prisma.catalogItem.findMany({ where: { tenantId: tenant.id }, select: { id: true } });
    let variantsCreated = 0;
    for (const item of allItems) {
        await prisma.itemVariant.upsert({
            where: {
                tenantId_sku: { tenantId: tenant.id, sku: `default-${item.id}` }
            },
            update: { isDefault: true, isAvailable: true },
            create: {
                tenantId: tenant.id,
                catalogItemId: item.id,
                sku: `default-${item.id}`,
                isDefault: true,
                isAvailable: true,
            }
        });
        variantsCreated++;
    }
    console.log(`✅ ItemVariants (default per item): ${variantsCreated}`);

    // Phase 4.1: Offers for must-have (branch, variant) — ACTIVE + isAvailable + visible via CategoryBranch
    const branchesForOffer = await prisma.branch.findMany({
        where: { tenantId: tenant.id },
        select: { id: true }
    });
    let offersCreated = 0;
    for (const branch of branchesForOffer) {
        const categoryIdsInBranch = await prisma.categoryBranch.findMany({
            where: { tenantId: tenant.id, branchId: branch.id },
            select: { categoryId: true }
        }).then(rows => rows.map(r => r.categoryId));
        const activeItemIds = await prisma.catalogItem.findMany({
            where: {
                tenantId: tenant.id,
                status: "ACTIVE",
                categoryId: { in: categoryIdsInBranch }
            },
            select: { id: true, basePriceCents: true }
        });
        const defaultVariants = await prisma.itemVariant.findMany({
            where: {
                tenantId: tenant.id,
                catalogItemId: { in: activeItemIds.map(i => i.id) },
                isDefault: true,
                isAvailable: true
            },
            select: { id: true, catalogItemId: true, priceDeltaCents: true }
        });
        const itemPriceMap = new Map(activeItemIds.map(i => [i.id, i.basePriceCents ?? 0]));
        const tenantCurrency = tenant.currency ?? "UAH";
        for (const v of defaultVariants) {
            const baseCents = itemPriceMap.get(v.catalogItemId) ?? 0;
            const deltaCents = v.priceDeltaCents ?? 0;
            const priceCents = baseCents + deltaCents;
            await prisma.offer.upsert({
                where: {
                    tenantId_branchId_variantId: {
                        tenantId: tenant.id,
                        branchId: branch.id,
                        variantId: v.id
                    }
                },
                update: { priceCents, currency: tenantCurrency, isAvailable: true },
                create: {
                    tenantId: tenant.id,
                    branchId: branch.id,
                    variantId: v.id,
                    priceCents,
                    currency: tenantCurrency,
                    isAvailable: true
                }
            });
            offersCreated++;
        }
    }
    console.log(`✅ Offers (must-have per branch): ${offersCreated}`);

    console.log("\n🎉 Seed completed successfully!");
    console.log("\n📋 Development Environment Setup:");
    console.log("   Tenant: vendora-sushi-hq");
    console.log("   Admin: admin@vendora.com / 123456");
    console.log("   Branches: kyiv-bazhana, lviv-rynok, odesa-arkadia");
    console.log("   Categories: 5");
    console.log("   CatalogItems: 16");
    console.log("   ItemVariants: 16 (one default per item)");
    console.log("   Offers: must-have (branch × variant) per branch");
    console.log("\n🚀 Ready to use!");
}

main()
    .catch((e) => {
        console.error("❌ Seed failed:", e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
