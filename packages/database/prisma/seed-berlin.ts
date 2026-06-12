import { prisma } from "../src";

type LocalizedValue = { en?: string; de?: string };

type Book = {
    id: string;
    title: LocalizedValue | string;
    author: LocalizedValue | string;
    price: number;
    oldPrice?: number;
    coverUrl: string;
    badges: string[];
    type: "publisher" | "author_project";
    isPreorder: boolean;
    stock: number;
    description: LocalizedValue | string;
    details: { pages: number; year: number; publisher?: string; weight?: string; dimensions?: string };
    genre: Array<LocalizedValue | string>;
    ageRating: string;
    releaseDate: string;
    variants: Array<{ format: string; language: string; price: number; stock: number; isbn: string }>;
};

const TENANT_SLUG = "berlin-press";

const BOOKS: Book[] = [
    {
        id: "1",
        title: {
            en: "Shadows of Berlin",
            de: "Schatten von Berlin",
        },
        author: {
            en: "Anna Stern",
            de: "Anna Stern",
        },
        price: 24.0,
        coverUrl: "https://images.unsplash.com/photo-1470219556762-1771e7f9427d?auto=format&fit=crop&q=80&w=800",
        badges: ["new", "bestseller"],
        type: "publisher",
        isPreorder: false,
        stock: 15,
        description: {
            en: "A gripping novel about the secrets of the old city intertwined with the present.",
            de: "Ein fesselnder Roman über die Geheimnisse der alten Stadt, verwoben mit der Gegenwart.",
        },
        details: { pages: 320, year: 2023, publisher: "Berlin Press", weight: "450g", dimensions: "140x210mm" },
        genre: [
            { en: "Fiction", de: "Belletristik"},
            { en: "History", de: "Geschichte"},
        ],
        ageRating: "16+",
        releaseDate: "2023-10-01",
        variants: [
            { format: "hardcover", language: "Deutsch", price: 24.0, stock: 10, isbn: "978-3-16-148410-0" },
            { format: "paperback", language: "Deutsch", price: 18.0, stock: 5, isbn: "978-3-16-148410-X" },
        ],
    },
    {
        id: "2",
        title: {
            en: "Philosophy of Silence",
            de: "Philosophie der Stille",
        },
        author: {
            en: "Mark Weber",
            de: "Mark Weber",
        },
        price: 18.5,
        oldPrice: 22.0,
        coverUrl: "https://images.unsplash.com/photo-1541701494587-cb58502866ab?auto=format&fit=crop&q=80&w=800",
        badges: [],
        type: "publisher",
        isPreorder: false,
        stock: 4,
        description: {
            en: "An essay on finding calm in a noisy world. A book-meditation.",
            de: "Ein Essay über die Suche nach Ruhe in einer lauten Welt. Ein Buch der Meditation.",
        },
        details: { pages: 180, year: 2022, publisher: "Berlin Press", weight: "200g", dimensions: "120x190mm" },
        genre: [{ en: "Philosophy", de: "Philosophie"}],
        ageRating: "12+",
        releaseDate: "2022-05-15",
        variants: [
            { format: "paperback", language: "Deutsch", price: 18.5, stock: 4, isbn: "978-3-16-148410-1" },
        ],
    },
    {
        id: "3",
        title: {
            en: "Forbidden Archive",
            de: "Das verbotene Archiv",
        },
        author: {
            en: "Dmitry Volkov",
            de: "Dmitry Volkov",
        },
        price: 28.0,
        coverUrl: "https://images.unsplash.com/photo-1550684848-fac1c5b4e853?auto=format&fit=crop&q=80&w=800",
        badges: ["18+", "preorder"],
        type: "author_project",
        isPreorder: true,
        stock: 0,
        description: {
            en: "A fast-paced thriller based on real events.",
            de: "Ein rasanter Thriller, basierend auf realen Ereignissen.",
        },
        details: { pages: 450, year: 2024, publisher: "Samizdat", weight: "600g", dimensions: "150x230mm" },
        genre: [
            { en: "History", de: "Geschichte"},
            { en: "Biography", de: "Biografie"},
        ],
        ageRating: "18+",
        releaseDate: "2024-03-01",
        variants: [
            { format: "hardcover", language: "Deutsch", price: 28.0, stock: 0, isbn: "978-3-16-148410-2" },
        ],
    },
    {
        id: "4",
        title: {
            en: "Poems of the Eternal",
            de: "Gedichte vom Ewigen",
        },
        author: {
            en: "Elena Kross",
            de: "Elena Kross",
        },
        price: 15.0,
        coverUrl: "https://images.unsplash.com/photo-1618519764620-7403abdbdfe9?auto=format&fit=crop&q=80&w=800",
        badges: ["new"],
        type: "author_project",
        isPreorder: false,
        stock: 8,
        description: {
            en: "A collection of philosophical lyrics about time, memory, and love.",
            de: "Eine Sammlung philosophischer Lyrik über Zeit, Erinnerung und Liebe.",
        },
        details: { pages: 120, year: 2024, publisher: "Berlin Press", weight: "180g", dimensions: "110x170mm" },
        genre: [{ en: "Poetry", de: "Poesie"}],
        ageRating: "12+",
        releaseDate: "2024-01-05",
        variants: [
            { format: "paperback", language: "Deutsch", price: 15.0, stock: 8, isbn: "978-3-16-148410-3" },
        ],
    },
];

const CATEGORY_ORDER = ["archive", "inventory", "collectors"] as const;

const CATEGORIES = [
    { slug: "archive", title: "Archive", sortOrder: 1 },
    { slug: "inventory", title: "Inventory", sortOrder: 2 },
    { slug: "collectors", title: "Collectors", sortOrder: 3 },
];

type AttributeValueType = "STRING" | "NUMBER" | "BOOL" | "DATE";

const ATTRIBUTE_DEFINITIONS: Array<{ key: string; label: string; valueType: AttributeValueType; isFilterable: boolean; isSearchable: boolean }> = [
    { key: "title_de", label: "Title (DE)", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "title_en", label: "Title (EN)", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "author_de", label: "Author (DE)", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "author_en", label: "Author (EN)", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "desc_de", label: "Description (DE)", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "desc_en", label: "Description (EN)", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "year", label: "Release year", valueType: "NUMBER", isFilterable: true, isSearchable: false },
    { key: "pages", label: "Pages", valueType: "NUMBER", isFilterable: true, isSearchable: false },
    { key: "old_price", label: "Old price", valueType: "NUMBER", isFilterable: true, isSearchable: false },
    { key: "isbn", label: "ISBN", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "publisher", label: "Publisher", valueType: "STRING", isFilterable: false, isSearchable: true },
    { key: "dimensions", label: "Dimensions", valueType: "STRING", isFilterable: false, isSearchable: false },
    { key: "genre", label: "Genres", valueType: "STRING", isFilterable: true, isSearchable: false },
    { key: "badges", label: "Badges", valueType: "STRING", isFilterable: true, isSearchable: false },
    { key: "format", label: "Format", valueType: "STRING", isFilterable: true, isSearchable: false },
    { key: "age_rating", label: "Age rating", valueType: "STRING", isFilterable: true, isSearchable: false },
    { key: "release_date", label: "Release date", valueType: "DATE", isFilterable: true, isSearchable: false },
    { key: "type", label: "Type", valueType: "STRING", isFilterable: true, isSearchable: false },
    { key: "stock", label: "Stock", valueType: "NUMBER", isFilterable: false, isSearchable: false },
    { key: "preorder", label: "Preorder", valueType: "BOOL", isFilterable: true, isSearchable: false },
];

function pickLocalized(value: LocalizedValue | string, preferred: Array<keyof LocalizedValue> = ["de", "en"]) {
    if (typeof value === "string") return value;
    for (const key of preferred) {
        const v = value[key];
        if (v && v.trim()) return v.trim();
    }
    return "";
}

function slugify(value: string) {
    const slug = value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
    return slug;
}

function toMinor(amount: number) {
    return Math.round(amount * 100);
}

function flattenGenre(genres: Array<LocalizedValue | string>) {
    const parts: string[] = [];
    for (const g of genres) {
        const value = typeof g === "string" ? g : pickLocalized(g, ["en", "de"]);
        if (value) parts.push(value);
    }
    return parts.join(", ");
}

function firstVariant(book: Book) {
    return book.variants[0] ?? null;
}

async function main() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("seed-berlin is disabled in production.");
    }
    console.log("🌱 Seeding Berlin Press mock books...");

    const existingTenant = await prisma.tenant.findUnique({ where: { slug: TENANT_SLUG } });
    const tenant = existingTenant
        ? await prisma.tenant.update({
            where: { id: existingTenant.id },
            data: {
                isActive: true,
                currency: "EUR",
                countryCode: "DE",
                timezone: "Europe/Berlin",
                settings: {
                    ...(typeof existingTenant.settings === "object" && existingTenant.settings !== null ? existingTenant.settings : {}),
                    mainTemplate: "berlin-press",
                },
            },
        })
        : await prisma.tenant.create({
            data: {
                slug: TENANT_SLUG,
                name: "Berlin Press",
                isActive: true,
                currency: "EUR",
                countryCode: "DE",
                timezone: "Europe/Berlin",
                settings: { mainTemplate: "berlin-press" },
            },
        });

    const branches = await prisma.branch.findMany({
        where: { tenantId: tenant.id },
        orderBy: { id: "asc" },
    });

    let branchList = branches;
    if (branchList.length === 0) {
        const created = await prisma.branch.create({
            data: {
                slug: "berlin-hq",
                cityName: "Berlin",
                address: "Berlin",
                phones: ["+49 30 000000"],
                workingSchedule: {
                    mon: [{ start: "10:00", end: "18:00" }],
                    tue: [{ start: "10:00", end: "18:00" }],
                    wed: [{ start: "10:00", end: "18:00" }],
                    thu: [{ start: "10:00", end: "18:00" }],
                    fri: [{ start: "10:00", end: "18:00" }],
                    sat: [{ start: "11:00", end: "16:00" }],
                    sun: [],
                    overrides: {},
                },
                deliveryFee: 0,
                freeFrom: 0,
                etaMin: 0,
                etaMax: 0,
                zones: [],
                isActive: true,
                tenantId: tenant.id,
            },
        });
        branchList = [created];
    }

    if (!tenant.defaultBranchId && branchList[0]) {
        await prisma.tenant.update({
            where: { id: tenant.id },
            data: {
                defaultBranchId: branchList[0].id,
                branchesMode: branchList.length <= 1 ? "SINGLE" : "MULTI",
            },
        });
    }

    const categoryBySlug = new Map<string, { id: string; slug: string }>();
    for (const cat of CATEGORIES) {
        const created = await prisma.category.upsert({
            where: { slug_tenantId: { slug: cat.slug, tenantId: tenant.id } },
            update: { title: cat.title, sortOrder: cat.sortOrder, isAvailable: true },
            create: { slug: cat.slug, title: cat.title, sortOrder: cat.sortOrder, isAvailable: true, tenantId: tenant.id },
        });
        categoryBySlug.set(created.slug, created);
    }

    for (const cat of categoryBySlug.values()) {
        for (const branch of branchList) {
            await prisma.categoryBranch.upsert({
                where: {
                    tenantId_categoryId_branchId: {
                        tenantId: tenant.id,
                        categoryId: cat.id,
                        branchId: branch.id,
                    },
                },
                update: {},
                create: {
                    tenantId: tenant.id,
                    categoryId: cat.id,
                    branchId: branch.id,
                },
            });
        }
    }

    const definitions = new Map<string, { id: string; valueType: AttributeValueType }>();
    for (const def of ATTRIBUTE_DEFINITIONS) {
        const created = await prisma.attributeDefinition.upsert({
            where: { tenantId_key: { tenantId: tenant.id, key: def.key } },
            update: {
                label: def.label,
                valueType: def.valueType as unknown as "STRING" | "NUMBER" | "BOOL" | "ENUM" | "DATE",
                isFilterable: def.isFilterable,
                isSearchable: def.isSearchable,
                appliesToBaseTypes: ["GOOD"],
            },
            create: {
                tenantId: tenant.id,
                key: def.key,
                label: def.label,
                valueType: def.valueType as unknown as "STRING" | "NUMBER" | "BOOL" | "ENUM" | "DATE",
                isFilterable: def.isFilterable,
                isSearchable: def.isSearchable,
                appliesToBaseTypes: ["GOOD"],
            },
        });
        definitions.set(created.key, { id: created.id, valueType: def.valueType });
    }

    for (const [index, book] of BOOKS.entries()) {
        const categorySlug = CATEGORY_ORDER[index % CATEGORY_ORDER.length];
        const fallbackCategory = Array.from(categoryBySlug.values())[0];
        const category = categorySlug ? categoryBySlug.get(categorySlug) ?? fallbackCategory : fallbackCategory;
        if (!category) continue;

        const titleDe = pickLocalized(book.title, ["de", "en"]);
        const titleEn = pickLocalized(book.title, ["en", "de"]);
        const descDe = pickLocalized(book.description, ["de", "en"]);
        const descEn = pickLocalized(book.description, ["en", "de"]);

        const slugBase = slugify(titleEn || titleDe);
        const slug = slugBase || `book-${index + 1}`;

        const item = await prisma.catalogItem.upsert({
            where: { slug_tenantId: { slug, tenantId: tenant.id } },
            update: {
                title: titleDe || titleEn || slug,
                desc: descDe || descEn || null,
                basePriceCents: toMinor(book.price),
                weightG: book.details.year,
                imageUrl: book.coverUrl,
                categoryId: category.id,
                status: "ACTIVE",
            },
            create: {
                slug,
                title: titleDe || titleEn || slug,
                desc: descDe || descEn || null,
                basePriceCents: toMinor(book.price),
                weightG: book.details.year,
                imageUrl: book.coverUrl,
                categoryId: category.id,
                baseType: "GOOD",
                status: "ACTIVE",
                tenantId: tenant.id,
            },
        });

        const defaultVariant = await prisma.itemVariant.findFirst({
            where: { tenantId: tenant.id, catalogItemId: item.id, isDefault: true },
        });
        const variant = defaultVariant
            ? defaultVariant
            : await prisma.itemVariant.create({
                data: {
                    tenantId: tenant.id,
                    catalogItemId: item.id,
                    sku: `default-${item.id}`,
                    isDefault: true,
                    isAvailable: true,
                },
            });

        for (const branch of branchList) {
            await prisma.offer.upsert({
                where: { tenantId_branchId_variantId: { tenantId: tenant.id, branchId: branch.id, variantId: variant.id } },
                update: { priceCents: toMinor(book.price), currency: "EUR", isAvailable: true },
                create: { tenantId: tenant.id, branchId: branch.id, variantId: variant.id, priceCents: toMinor(book.price), currency: "EUR", isAvailable: true },
            });
        }

        const first = firstVariant(book);
        const badges = book.badges.join(", ");
        const genre = flattenGenre(book.genre);

        type AttributePayload =
            | { type: "STRING"; value: string }
            | { type: "NUMBER"; value: number }
            | { type: "BOOL"; value: boolean }
            | { type: "DATE"; value: Date };

        const values: Record<string, AttributePayload | null> = {
            title_de: { type: "STRING", value: titleDe },
            title_en: { type: "STRING", value: titleEn },
            author_de: { type: "STRING", value: pickLocalized(book.author, ["de", "en"]) },
            author_en: { type: "STRING", value: pickLocalized(book.author, ["en", "de"]) },
            desc_de: { type: "STRING", value: descDe },
            desc_en: { type: "STRING", value: descEn },
            year: { type: "NUMBER", value: book.details.year },
            pages: { type: "NUMBER", value: book.details.pages },
            old_price: book.oldPrice ? { type: "NUMBER", value: book.oldPrice } : null,
            isbn: first?.isbn ? { type: "STRING", value: first.isbn } : null,
            publisher: book.details.publisher ? { type: "STRING", value: book.details.publisher } : null,
            dimensions: book.details.dimensions ? { type: "STRING", value: book.details.dimensions } : null,
            genre: genre ? { type: "STRING", value: genre } : null,
            badges: badges ? { type: "STRING", value: badges } : null,
            format: first?.format ? { type: "STRING", value: first.format } : null,
            age_rating: { type: "STRING", value: book.ageRating },
            release_date: { type: "DATE", value: new Date(book.releaseDate) },
            type: { type: "STRING", value: book.type },
            stock: { type: "NUMBER", value: book.stock },
            preorder: { type: "BOOL", value: book.isPreorder },
        };

        for (const [key, payload] of Object.entries(values)) {
            if (!payload) continue;
            const def = definitions.get(key);
            if (!def) continue;

            const data: { valueString?: string; valueNumber?: number; valueBool?: boolean; valueDate?: Date } = {};
            if (payload.type === "STRING") {
                const text = payload.value.trim();
                if (!text) continue;
                data.valueString = text;
            } else if (payload.type === "NUMBER") {
                const num = payload.value;
                if (!Number.isFinite(num)) continue;
                data.valueNumber = num;
            } else if (payload.type === "BOOL") {
                data.valueBool = payload.value;
            } else if (payload.type === "DATE") {
                const date = payload.value;
                if (Number.isNaN(date.getTime())) continue;
                data.valueDate = date;
            }

            await prisma.attributeValue.upsert({
                where: { tenantId_itemId_definitionId: { tenantId: tenant.id, itemId: item.id, definitionId: def.id } },
                update: data,
                create: {
                    tenantId: tenant.id,
                    itemId: item.id,
                    definitionId: def.id,
                    ...data,
                },
            });
        }
    }

    console.log("✅ Berlin Press seeded.");
}

main()
    .catch((err) => {
        console.error("Seed failed:", err);
        process.exitCode = 1;
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
