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
            cityName: "Київ",
            address: "просп. Миколи Бажана, 17",
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
            zones: ["Лівий берег", "Дарниця"],
            isActive: true,
            tenantId: tenant.id,
        },
        {
            slug: "lviv-rynok",
            cityName: "Львів",
            address: "пл. Ринок, 1",
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
            zones: ["Центр", "Сихів"],
            isActive: true,
            tenantId: tenant.id,
        },
        {
            slug: "odesa-arkadia",
            cityName: "Одеса",
            address: "Аркадійська алея, 1",
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
            zones: ["Аркадія", "Приморський"],
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
        { slug: "sushi", title: "Суші", sortOrder: 1 },
        { slug: "rolls", title: "Роли", sortOrder: 2 },
        { slug: "sets", title: "Сети", sortOrder: 3 },
        { slug: "dishes", title: "Страви", sortOrder: 4 },
        { slug: "drinks", title: "Напої", sortOrder: 5 },
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
            title: "Нігірі Лосось",
            price: 6500,
            weightG: 35,
            imageUrl: "/demo/sushi/nigiri-salmon.svg",
            desc: "Свіжий лосось на рисі"
        },
        {
            slug: "nigiri-tuna",
            cat: "sushi",
            title: "Нігірі Тунець",
            price: 7500,
            weightG: 35,
            imageUrl: "/demo/sushi/nigiri-tuna.svg",
            desc: "Свіжий тунець на рисі"
        },

        // Rolls
        {
            slug: "philadelphia",
            cat: "rolls",
            title: "Філадельфія",
            price: 24500,
            weightG: 280,
            desc: "Лосось, сир філадельфія, огірок",
            imageUrl: "/demo/rolls/philadelphia.svg"
        },
        {
            slug: "california",
            cat: "rolls",
            title: "Каліфорнія",
            price: 21000,
            weightG: 260,
            desc: "Краб, ікра тобіко, авокадо",
            imageUrl: "/demo/rolls/california.svg"
        },
        {
            slug: "dragon",
            cat: "rolls",
            title: "Зелений Дракон",
            price: 28000,
            weightG: 290,
            desc: "Вугор, авокадо, соус унагі",
            imageUrl: "/demo/rolls/dragon.svg"
        },
        {
            slug: "spicy-tuna",
            cat: "rolls",
            title: "Спайсі Тунець",
            price: 23000,
            weightG: 250,
            desc: "Тунець, спайсі соус, огірок",
            imageUrl: "/demo/rolls/spicy-tuna.svg"
        },
        {
            slug: "veggie",
            cat: "rolls",
            title: "Вегетта",
            price: 18000,
            weightG: 220,
            desc: "Огірок, болгарський перець, салат",
            imageUrl: "/demo/rolls/cucumber.svg"
        },

        // Sets
        {
            slug: "set-classic",
            cat: "sets",
            title: "Сет Класичний",
            price: 85000,
            weightG: 950,
            desc: "Філадельфія, Каліфорнія, Макі",
            imageUrl: "/demo/sets/classic.svg"
        },
        {
            slug: "set-family",
            cat: "sets",
            title: "Сет Сімейний",
            price: 120000,
            weightG: 1400,
            desc: "5 різних ролів для всієї сім'ї",
            imageUrl: "/demo/sets/family.svg"
        },
        {
            slug: "set-weekend",
            cat: "sets",
            title: "Сет Вікенд",
            price: 155000,
            weightG: 1800,
            desc: "Великий набір для вечірки",
            imageUrl: "/demo/sets/weekend.svg"
        },

        // Dishes
        {
            slug: "wok-chicken",
            cat: "dishes",
            title: "WOK Курка",
            price: 16500,
            weightG: 350,
            imageUrl: "/demo/wok/teriyaki.svg",
            desc: "Курка з овочами в соусі теріякі"
        },
        {
            slug: "wok-veggie",
            cat: "dishes",
            title: "WOK Овочі",
            price: 14000,
            weightG: 320,
            imageUrl: "/demo/wok/veggie.svg",
            desc: "Асорті овочів з соєвим соусом"
        },
        {
            slug: "wok-shrimp",
            cat: "dishes",
            title: "WOK Креветки",
            price: 21500,
            weightG: 330,
            imageUrl: "/demo/wok/shrimp.svg",
            desc: "Креветки з овочами та часником"
        },

        // Drinks
        {
            slug: "cola-05",
            cat: "drinks",
            title: "Coca-Cola 0.5",
            price: 4000,
            imageUrl: "/demo/drinks/cola.svg",
            desc: "Класична кола"
        },
        {
            slug: "matcha-latte",
            cat: "drinks",
            title: "Матча Латте",
            price: 8500,
            imageUrl: "/demo/drinks/matcha.svg",
            desc: "Японський зелений чай з молоком"
        },
        {
            slug: "water-05",
            cat: "drinks",
            title: "Вода 0.5",
            price: 3000,
            imageUrl: "/demo/drinks/water.svg",
            desc: "Мінеральна вода"
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
