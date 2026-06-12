/// <reference types="node" />
import { PrismaClient, Tenant, Category, CatalogItem, Order, OrderLine, OrderLineOption, OrderAdjustment, Fulfillment, CustomDomain, Branch, ItemNutritionFacet, ItemAllergenFacet, ItemVariant, OptionGroup, OptionItem, Offer, AttributeDefinition, AttributeValue, Integration, IntegrationState, ExternalMapping, DeliveryConfigFacet } from '@prisma/client';
import { URL } from 'node:url';

// SAFETY GATES
if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: Cannot run isolation test in production!');
    process.exit(1);
}

const dbUrl = process.env.DATABASE_URL;
if (!dbUrl) {
    console.error('❌ FATAL: DATABASE_URL is missing!');
    process.exit(1);
}

try {
    const parsed = new URL(dbUrl);
    if (parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1') {
        console.error(`❌ FATAL: Refusing to run on non-local DB host: ${parsed.hostname}`);
        process.exit(1);
    }
} catch (e) {
    console.error('❌ FATAL: Invalid DATABASE_URL format.');
    process.exit(1);
}

const prisma = new PrismaClient();

async function run() {
    const runSuffix = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const victimSlug = `isotest-victim-${runSuffix}`;
    const evilSlug = `isotest-evil-${runSuffix}`;

    console.log(`[isolation-test] starting with suffix: ${runSuffix}`);

    let victimTenant: Tenant | null = null;
    let evilTenant: Tenant | null = null;
    let evilBranch: Branch | null = null;
    let evilCategory: Category | null = null;
    let evilCatalogItem: CatalogItem | null = null;
    let evilVariant: ItemVariant | null = null;
    let evilOptionGroup: OptionGroup | null = null;
    let evilOptionItem: OptionItem | null = null;
    let evilNutritionFacet: ItemNutritionFacet | null = null;
    let evilAllergenFacet: ItemAllergenFacet | null = null;
    let evilOrder: Order | null = null;
    let evilOrderLine: OrderLine | null = null;
    let evilOrderAdjustment: OrderAdjustment | null = null;
    let evilFulfillment: Fulfillment | null = null;
    let evilOrderLineOption: OrderLineOption | null = null;
    let evilOffer: Offer | null = null;
    let evilAttributeDefinition: AttributeDefinition | null = null;
    let evilAttributeValue: AttributeValue | null = null;
    let evilIntegration: Integration | null = null;
    let evilIntegrationState: IntegrationState | null = null;
    let evilExternalMapping: ExternalMapping | null = null;
    let evilDeliveryConfigFacet: DeliveryConfigFacet | null = null;
    let evilCustomer: { id: string } | null = null;
    let victimDomain: CustomDomain | null = null;

    try {
        // 1. SETUP
        console.log('[SETUP] Creating tenants...');
        victimTenant = await prisma.tenant.create({
            data: { name: 'Victim Tenant', slug: victimSlug }
        });
        evilTenant = await prisma.tenant.create({
            data: { name: 'Evil Corp', slug: evilSlug }
        });

        console.log(`[SETUP] Victim ID: ${victimTenant.id}`);
        console.log(`[SETUP] Evil ID: ${evilTenant.id}`);

        // Create resources for evil tenant
        evilBranch = await prisma.branch.create({
            data: {
                slug: `evil-branch-${runSuffix}`,
                cityName: 'Evil City',
                phones: [],
                zones: [],
                tenantId: evilTenant.id
            }
        });

        await prisma.tenant.update({
            where: { id: evilTenant.id },
            data: {
                branchesMode: "SINGLE",
                defaultBranchId: evilBranch.id,
            },
        });

        evilCategory = await prisma.category.create({
            data: {
                title: 'Evil Cat',
                slug: `evil-cat-${runSuffix}`,
                tenantId: evilTenant.id
            }
        });

        // Phase 1.3: CategoryBranch (join) for evil — used in write test (victim must not delete/update it)
        await prisma.categoryBranch.create({
            data: {
                tenantId: evilTenant.id,
                categoryId: evilCategory.id,
                branchId: evilBranch.id,
            }
        });

        evilCatalogItem = await prisma.catalogItem.create({
            data: {
                title: 'Secret Sauce',
                slug: `secret-sauce-${runSuffix}`,
                basePriceCents: 666,
                baseType: 'GOOD',
                status: 'ACTIVE',
                categoryId: evilCategory.id,
                tenantId: evilTenant.id
            }
        });

        // Phase 2.1: Default ItemVariant per item
        evilVariant = await prisma.itemVariant.create({
            data: {
                tenantId: evilTenant.id,
                catalogItemId: evilCatalogItem.id,
                sku: `default-${evilCatalogItem.id}`,
                isDefault: true,
                isAvailable: true,
            }
        });

        // Phase 2.2: OptionGroup and OptionItem (modifiers)
        evilOptionGroup = await prisma.optionGroup.create({
            data: { tenantId: evilTenant.id, name: `evil-options-${runSuffix}`, isRequired: false }
        });
        evilOptionItem = await prisma.optionItem.create({
            data: {
                tenantId: evilTenant.id,
                optionGroupId: evilOptionGroup.id,
                name: 'Evil Extra',
                priceDeltaCents: 100,
            }
        });

        // Phase 4.1: Offer (price/availability per branch)
        evilOffer = await prisma.offer.create({
            data: {
                tenantId: evilTenant.id,
                branchId: evilBranch.id,
                variantId: evilVariant.id,
                priceCents: 666,
                currency: 'UAH',
                isAvailable: true,
            }
        });
        console.log(`[SETUP] Created Evil Offer: ${evilOffer.id}`);

        // Phase 5.1: AttributeDefinition and AttributeValue (tenant-scoped)
        evilAttributeDefinition = await prisma.attributeDefinition.create({
            data: {
                tenantId: evilTenant.id,
                key: `evil-attr-${runSuffix}`,
                label: 'Evil Attribute',
                valueType: 'STRING',
                appliesToBaseTypes: ['GOOD'],
                isFilterable: true,
                isSearchable: false,
            },
        });
        evilAttributeValue = await prisma.attributeValue.create({
            data: {
                tenantId: evilTenant.id,
                itemId: evilCatalogItem.id,
                definitionId: evilAttributeDefinition.id,
                valueString: 'evil-value',
                valueNumber: null,
                valueBool: null,
                valueDate: null,
            },
        });
        console.log(`[SETUP] Created Evil AttributeDefinition: ${evilAttributeDefinition.id}, AttributeValue: ${evilAttributeValue.id}`);

        evilOrder = await prisma.order.create({
            data: {
                token: `EVIL_TOKEN_${runSuffix}`,
                orderId: `EVIL-${runSuffix}`,
                branchSlug: `evil-branch-${runSuffix}`,
                branchId: evilBranch.id, // Phase 4.3: canonical location (NOT NULL)
                status: 'created',
                total: 666,
                currency: 'UAH',
                payload: {},
                tenantId: evilTenant.id
            }
        });
        console.log(`[SETUP] Created Evil Order: ${evilOrder.orderId}`);

        // Phase 3.1: OrderLine (snapshot at order creation); Phase 4.4: offerId NOT NULL
        evilOrderLine = await prisma.orderLine.create({
            data: {
                tenantId: evilTenant.id,
                orderId: evilOrder.id,
                offerId: evilOffer.id,
                variantId: evilVariant.id, // snapshot only
                qty: 1,
                priceCents: 666,
                currency: 'UAH',
                itemTitle: 'Secret Sauce',
                sku: evilVariant.sku
            }
        });
        console.log(`[SETUP] Created Evil OrderLine: ${evilOrderLine.id}`);

        // Phase 3.2: OrderAdjustment (delivery_fee, etc.; amountCents in Order.currency)
        evilOrderAdjustment = await prisma.orderAdjustment.create({
            data: {
                tenantId: evilTenant.id,
                orderId: evilOrder.id,
                type: 'delivery_fee',
                amountCents: 100,
                label: 'Evil Delivery'
            }
        });
        console.log(`[SETUP] Created Evil OrderAdjustment: ${evilOrderAdjustment.id}`);

        // Phase 3.3: Fulfillment (1:1 with Order)
        evilFulfillment = await prisma.fulfillment.create({
            data: {
                tenantId: evilTenant.id,
                orderId: evilOrder.id,
                type: 'pickup',
                address: null,
                status: 'pending'
            }
        });
        console.log(`[SETUP] Created Evil Fulfillment: ${evilFulfillment.id}`);

        // Phase 3.4: OrderLineOption (selected options per order line)
        evilOrderLineOption = await prisma.orderLineOption.create({
            data: {
                tenantId: evilTenant.id,
                orderLineId: evilOrderLine.id,
                optionItemId: evilOptionItem.id,
                qty: 1,
                priceDeltaCents: 100,
                optionItemTitleSnapshot: 'Evil Extra'
            }
        });
        console.log(`[SETUP] Created Evil OrderLineOption: ${evilOrderLineOption.id}`);

        evilCustomer = await prisma.customer.create({
            data: { phone: `+380666000000_${runSuffix}`, tenantId: evilTenant.id }
        });
        await prisma.customerFavorite.create({
            data: { tenantId: evilTenant.id, customerId: evilCustomer.id, catalogItemId: evilCatalogItem.id }
        });

        // Phase 1.4: ItemNutritionFacet (tenant-scoped)
        evilNutritionFacet = await prisma.itemNutritionFacet.create({
            data: {
                tenantId: evilTenant.id,
                catalogItemId: evilCatalogItem.id,
                caloriesKcal: 500,
                proteinG: 20,
                fatG: 15,
                carbsG: 60,
            }
        });

        // Phase 5.2: ItemAllergenFacet (tenant-scoped, capability "allergens")
        evilAllergenFacet = await prisma.itemAllergenFacet.create({
            data: {
                tenantId: evilTenant.id,
                catalogItemId: evilCatalogItem.id,
                allergenCodes: ['gluten', 'nuts'],
            }
        });
        console.log(`[SETUP] Created Evil ItemAllergenFacet: ${evilAllergenFacet.id}`);

        // Phase 6.1: Integration, IntegrationState, ExternalMapping (tenant-scoped)
        evilIntegration = await prisma.integration.create({
            data: {
                tenantId: evilTenant.id,
                provider: `evil-provider-${runSuffix}`,
                credentialsRef: null,
                status: 'ACTIVE',
            },
        });
        evilIntegrationState = await prisma.integrationState.create({
            data: {
                tenantId: evilTenant.id,
                provider: evilIntegration.provider,
                entityType: '_global',
                cursor: { lastSyncAt: new Date().toISOString() },
            },
        });
        evilExternalMapping = await prisma.externalMapping.create({
            data: {
                tenantId: evilTenant.id,
                provider: evilIntegration.provider,
                entityType: 'catalog_item',
                externalId: `ext-${evilCatalogItem.id}`,
                internalId: evilCatalogItem.id,
            },
        });
        console.log(`[SETUP] Created Evil Integration: ${evilIntegration.id}, State: ${evilIntegrationState.id}, Mapping: ${evilExternalMapping.id}`);

        // Phase 6.2: DeliveryConfigFacet (1:1 with Branch)
        evilDeliveryConfigFacet = await prisma.deliveryConfigFacet.create({
            data: {
                tenantId: evilTenant.id,
                branchId: evilBranch.id,
                deliveryFee: 500,
                freeFrom: 2000,
                etaMin: 25,
                etaMax: 45,
                zones: ['zone-a'],
                minAdvanceMinutes: 60,
                prepTimeMinutes: 25,
                slotCapacity: 10,
            },
        });
        console.log(`[SETUP] Created Evil DeliveryConfigFacet: ${evilDeliveryConfigFacet.id}`);

        victimDomain = await prisma.customDomain.create({
            data: {
                domain: `isotest-victim-${runSuffix}.test`,
                tenantId: victimTenant.id,
                txtRecord: 'dummy-txt-isolation-test'
            }
        });
        console.log(`[SETUP] Created Victim CustomDomain: ${victimDomain.domain}`);

        // 2. ASSERTIONS

        // c) Negative read
        console.log('[TEST] Negative read (Victim accessing Evil CatalogItem)...');
        const leakedItem = await prisma.catalogItem.findUnique({
            where: {
                slug_tenantId: {
                    slug: evilCatalogItem.slug,
                    tenantId: victimTenant.id // Wrong tenant!
                }
            }
        });

        const leakedItemById = await prisma.catalogItem.findFirst({
            where: {
                id: evilCatalogItem.id,
                tenantId: victimTenant.id
            }
        });

        if (leakedItem || leakedItemById) {
            throw new Error('❌ FAIL: Victim was able to read Evil CatalogItem!');
        }
        console.log('✅ PASS: Victim cannot see Evil CatalogItem.');

        // Branch: Victim cannot read Evil Branch (cross-tenant)
        console.log('[TEST] Branch: Victim cannot read Evil Branch...');
        const victimSeesEvilBranch = await prisma.branch.findFirst({
            where: { id: evilBranch.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilBranch) {
            throw new Error('❌ FAIL: Victim was able to read Evil Branch!');
        }
        console.log('✅ PASS: Victim cannot see Evil Branch.');

        // Category: Victim cannot read Evil Category (cross-tenant)
        console.log('[TEST] Category: Victim cannot read Evil Category...');
        const victimSeesEvilCategory = await prisma.category.findFirst({
            where: { id: evilCategory.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilCategory) {
            throw new Error('❌ FAIL: Victim was able to read Evil Category!');
        }
        console.log('✅ PASS: Victim cannot see Evil Category.');

        // Phase 1 DoD: write cross-tenant — Branch/Category/CategoryBranch (updateMany/deleteMany → count=0)
        console.log('[TEST] Branch: Victim cannot update Evil branch...');
        const victimUpdatesEvilBranch = await prisma.branch.updateMany({
            where: { id: evilBranch.id, tenantId: victimTenant.id },
            data: { cityName: 'x' },
        });
        if (victimUpdatesEvilBranch.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil Branch!');
        }
        console.log('✅ PASS: Victim cannot update Evil Branch.');

        console.log('[TEST] Category: Victim cannot update Evil category...');
        const victimUpdatesEvilCategory = await prisma.category.updateMany({
            where: { id: evilCategory.id, tenantId: victimTenant.id },
            data: { title: 'x' },
        });
        if (victimUpdatesEvilCategory.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil Category!');
        }
        console.log('✅ PASS: Victim cannot update Evil Category.');

        // CategoryBranch: evil row is (evilTenant, evilCategory.id, evilBranch.id). Victim deleteMany with tenantId=victim
        // cannot match that row → count=0. Tests: victim cannot delete evil's join row (cross-tenant write).
        console.log('[TEST] CategoryBranch: Victim cannot delete Evil join row...');
        const victimDeletesEvilCategoryBranch = await prisma.categoryBranch.deleteMany({
            where: {
                tenantId: victimTenant.id,
                categoryId: evilCategory.id,
                branchId: evilBranch.id,
            },
        });
        if (victimDeletesEvilCategoryBranch.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to delete Evil CategoryBranch!');
        }
        console.log('✅ PASS: Victim cannot delete Evil CategoryBranch.');

        // d) Negative delete
        console.log('[TEST] Negative delete (Victim deleting Evil IDs)...');
        const deleteAttempt = await prisma.catalogItem.deleteMany({
            where: {
                id: evilCatalogItem.id,
                tenantId: victimTenant.id
            }
        });
        if (deleteAttempt.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to delete Evil CatalogItem!');
        }
        console.log('✅ PASS: Victim cannot delete Evil CatalogItem.');

        // e) Positive read
        console.log('[TEST] Positive read (Evil Tenant accessing own data)...');
        const ownItem = await prisma.catalogItem.findFirst({
            where: {
                id: evilCatalogItem.id,
                tenantId: evilTenant.id
            }
        });
        if (!ownItem) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own CatalogItem!');
        }
        console.log('✅ PASS: Evil Tenant can see their own CatalogItem.');

        // CustomerFavorite: Victim cannot see Evil's favorite
        console.log('[TEST] CustomerFavorite: Victim cannot see Evil favorite...');
        const victimSeesEvilFavorite = await prisma.customerFavorite.findMany({
            where: { tenantId: victimTenant.id, customerId: evilCustomer.id }
        });
        if (victimSeesEvilFavorite.length !== 0) {
            throw new Error('❌ FAIL: Victim was able to read Evil CustomerFavorite!');
        }
        console.log('✅ PASS: Victim cannot see Evil CustomerFavorite.');

        // CustomerFavorite: Victim cannot delete Evil's favorite (by victim's tenant scope)
        console.log('[TEST] CustomerFavorite: Victim cannot delete Evil favorite...');
        const victimDeletesEvil = await prisma.customerFavorite.deleteMany({
            where: { tenantId: victimTenant.id, customerId: evilCustomer.id, catalogItemId: evilCatalogItem.id }
        });
        if (victimDeletesEvil.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to delete Evil CustomerFavorite!');
        }
        console.log('✅ PASS: Victim cannot delete Evil CustomerFavorite.');

        // CustomerFavorite: Evil tenant can see own favorite
        console.log('[TEST] CustomerFavorite: Evil Tenant can see own favorite...');
        const evilSeesOwn = await prisma.customerFavorite.findMany({
            where: { tenantId: evilTenant.id, customerId: evilCustomer.id }
        });
        if (evilSeesOwn.length !== 1) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own CustomerFavorite!');
        }
        console.log('✅ PASS: Evil Tenant can see their own CustomerFavorite.');

        // Order: Victim cannot read Evil's order (cross-tenant)
        console.log('[TEST] Order: Victim cannot read Evil order...');
        const victimSeesEvilOrder = await prisma.order.findFirst({
            where: { id: evilOrder.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilOrder) {
            throw new Error('❌ FAIL: Victim was able to read Evil Order!');
        }
        console.log('✅ PASS: Victim cannot see Evil Order.');

        // Order: Victim cannot delete Evil's order (cross-tenant)
        console.log('[TEST] Order: Victim cannot delete Evil order...');
        const victimDeletesEvilOrder = await prisma.order.deleteMany({
            where: { id: evilOrder.id, tenantId: victimTenant.id }
        });
        if (victimDeletesEvilOrder.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to delete Evil Order!');
        }
        console.log('✅ PASS: Victim cannot delete Evil Order.');

        // CustomDomain: Evil cannot read Victim's domain (cross-tenant)
        console.log('[TEST] CustomDomain: Evil cannot read Victim domain...');
        const evilSeesVictimDomain = await prisma.customDomain.findFirst({
            where: { id: victimDomain.id, tenantId: evilTenant.id }
        });
        if (evilSeesVictimDomain) {
            throw new Error('❌ FAIL: Evil was able to read Victim CustomDomain!');
        }
        console.log('✅ PASS: Evil cannot see Victim CustomDomain.');

        // CustomDomain: Evil cannot delete Victim's domain (cross-tenant)
        console.log('[TEST] CustomDomain: Evil cannot delete Victim domain...');
        const evilDeletesVictimDomain = await prisma.customDomain.deleteMany({
            where: { id: victimDomain.id, tenantId: evilTenant.id }
        });
        if (evilDeletesVictimDomain.count !== 0) {
            throw new Error('❌ FAIL: Evil was able to delete Victim CustomDomain!');
        }
        console.log('✅ PASS: Evil cannot delete Victim CustomDomain.');

        // ItemNutritionFacet: Victim cannot read Evil's facet (cross-tenant)
        console.log('[TEST] ItemNutritionFacet: Victim cannot read Evil facet...');
        const victimSeesEvilFacet = await prisma.itemNutritionFacet.findFirst({
            where: { id: evilNutritionFacet.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilFacet) {
            throw new Error('❌ FAIL: Victim was able to read Evil ItemNutritionFacet!');
        }
        console.log('✅ PASS: Victim cannot see Evil ItemNutritionFacet.');

        // ItemNutritionFacet: Victim cannot update Evil's facet
        console.log('[TEST] ItemNutritionFacet: Victim cannot update Evil facet...');
        const victimUpdatesEvilFacet = await prisma.itemNutritionFacet.updateMany({
            where: { id: evilNutritionFacet.id, tenantId: victimTenant.id },
            data: { caloriesKcal: 0 }
        });
        if (victimUpdatesEvilFacet.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil ItemNutritionFacet!');
        }
        console.log('✅ PASS: Victim cannot update Evil ItemNutritionFacet.');

        // ItemNutritionFacet: Evil tenant can read own facet
        console.log('[TEST] ItemNutritionFacet: Evil Tenant can see own facet...');
        const evilSeesOwnFacet = await prisma.itemNutritionFacet.findFirst({
            where: { id: evilNutritionFacet.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnFacet) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own ItemNutritionFacet!');
        }
        console.log('✅ PASS: Evil Tenant can see their own ItemNutritionFacet.');

        // Phase 5.2: ItemAllergenFacet — Victim cannot read Evil facet (cross-tenant)
        console.log('[TEST] ItemAllergenFacet: Victim cannot read Evil facet...');
        const victimSeesEvilAllergen = await prisma.itemAllergenFacet.findFirst({
            where: { id: evilAllergenFacet.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilAllergen) {
            throw new Error('❌ FAIL: Victim was able to read Evil ItemAllergenFacet!');
        }
        console.log('✅ PASS: Victim cannot see Evil ItemAllergenFacet.');

        // Phase 5.2: ItemAllergenFacet — Victim cannot update Evil facet
        console.log('[TEST] ItemAllergenFacet: Victim cannot update Evil facet...');
        const victimUpdatesEvilAllergen = await prisma.itemAllergenFacet.updateMany({
            where: { id: evilAllergenFacet.id, tenantId: victimTenant.id },
            data: { allergenCodes: ['dairy'] },
        });
        if (victimUpdatesEvilAllergen.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil ItemAllergenFacet!');
        }
        console.log('✅ PASS: Victim cannot update Evil ItemAllergenFacet.');

        // Phase 5.2: ItemAllergenFacet — Victim cannot create facet with Evil catalogItemId (composite FK rejects)
        console.log('[TEST] ItemAllergenFacet: Victim cannot create with Evil catalogItemId...');
        let crossTenantAllergenCreateSucceeded = false;
        try {
            await prisma.itemAllergenFacet.create({
                data: {
                    tenantId: victimTenant.id,
                    catalogItemId: evilCatalogItem.id,
                    allergenCodes: ['dairy'],
                },
            });
            crossTenantAllergenCreateSucceeded = true;
        } catch {
            // Expected: composite FK (tenantId, catalogItemId) → CatalogItem(tenantId, id) rejects cross-tenant catalogItemId
        }
        if (crossTenantAllergenCreateSucceeded) {
            throw new Error('❌ FAIL: Victim was able to create ItemAllergenFacet with Evil catalogItemId!');
        }
        console.log('✅ PASS: Victim cannot create ItemAllergenFacet with foreign catalogItemId.');

        // Phase 5.2: ItemAllergenFacet — Evil tenant can read own facet
        console.log('[TEST] ItemAllergenFacet: Evil Tenant can see own facet...');
        const evilSeesOwnAllergen = await prisma.itemAllergenFacet.findFirst({
            where: { id: evilAllergenFacet.id, tenantId: evilTenant.id },
        });
        if (!evilSeesOwnAllergen) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own ItemAllergenFacet!');
        }
        console.log('✅ PASS: Evil Tenant can see their own ItemAllergenFacet.');

        // ItemVariant: Victim cannot read Evil's variant (cross-tenant)
        console.log('[TEST] ItemVariant: Victim cannot read Evil variant...');
        const victimSeesEvilVariant = await prisma.itemVariant.findFirst({
            where: { id: evilVariant.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilVariant) {
            throw new Error('❌ FAIL: Victim was able to read Evil ItemVariant!');
        }
        console.log('✅ PASS: Victim cannot see Evil ItemVariant.');

        // ItemVariant: Evil tenant can read own variant
        console.log('[TEST] ItemVariant: Evil Tenant can see own variant...');
        const evilSeesOwnVariant = await prisma.itemVariant.findFirst({
            where: { id: evilVariant.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnVariant) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own ItemVariant!');
        }
        console.log('✅ PASS: Evil Tenant can see their own ItemVariant.');

        // OptionGroup: Victim cannot read Evil's option group
        console.log('[TEST] OptionGroup: Victim cannot read Evil option group...');
        const victimSeesEvilGroup = await prisma.optionGroup.findFirst({
            where: { id: evilOptionGroup.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilGroup) {
            throw new Error('❌ FAIL: Victim was able to read Evil OptionGroup!');
        }
        console.log('✅ PASS: Victim cannot see Evil OptionGroup.');

        // OptionItem: Victim cannot read Evil's option item
        console.log('[TEST] OptionItem: Victim cannot read Evil option item...');
        const victimSeesEvilOptItem = await prisma.optionItem.findFirst({
            where: { id: evilOptionItem.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilOptItem) {
            throw new Error('❌ FAIL: Victim was able to read Evil OptionItem!');
        }
        console.log('✅ PASS: Victim cannot see Evil OptionItem.');

        // OptionGroup/OptionItem: Evil tenant can read own
        console.log('[TEST] OptionGroup/OptionItem: Evil Tenant can see own...');
        const evilSeesOwnGroup = await prisma.optionGroup.findFirst({
            where: { id: evilOptionGroup.id, tenantId: evilTenant.id }
        });
        const evilSeesOwnOptItem = await prisma.optionItem.findFirst({
            where: { id: evilOptionItem.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnGroup || !evilSeesOwnOptItem) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own OptionGroup/OptionItem!');
        }
        console.log('✅ PASS: Evil Tenant can see their own OptionGroup and OptionItem.');

        // ItemVariant: Victim cannot update Evil's variant (cross-tenant write — DoD Phase 2)
        console.log('[TEST] ItemVariant: Victim cannot update Evil variant...');
        const victimUpdatesEvilVariant = await prisma.itemVariant.updateMany({
            where: { id: evilVariant.id, tenantId: victimTenant.id },
            data: { isAvailable: false }
        });
        if (victimUpdatesEvilVariant.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil ItemVariant!');
        }
        console.log('✅ PASS: Victim cannot update Evil ItemVariant.');

        // OptionGroup: Victim cannot update Evil's option group (cross-tenant write — DoD Phase 2)
        console.log('[TEST] OptionGroup: Victim cannot update Evil option group...');
        const victimUpdatesEvilGroup = await prisma.optionGroup.updateMany({
            where: { id: evilOptionGroup.id, tenantId: victimTenant.id },
            data: { name: 'x' }
        });
        if (victimUpdatesEvilGroup.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil OptionGroup!');
        }
        console.log('✅ PASS: Victim cannot update Evil OptionGroup.');

        // OptionItem: Victim cannot update Evil's option item (cross-tenant write — DoD Phase 2)
        console.log('[TEST] OptionItem: Victim cannot update Evil option item...');
        const victimUpdatesEvilOptItem = await prisma.optionItem.updateMany({
            where: { id: evilOptionItem.id, tenantId: victimTenant.id },
            data: { name: 'x' }
        });
        if (victimUpdatesEvilOptItem.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil OptionItem!');
        }
        console.log('✅ PASS: Victim cannot update Evil OptionItem.');

        // OrderLine: Victim cannot read Evil's order line (cross-tenant)
        console.log('[TEST] OrderLine: Victim cannot read Evil order line...');
        const victimSeesEvilOrderLine = await prisma.orderLine.findFirst({
            where: { id: evilOrderLine.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilOrderLine) {
            throw new Error('❌ FAIL: Victim was able to read Evil OrderLine!');
        }
        console.log('✅ PASS: Victim cannot see Evil OrderLine.');

        // OrderLine: Victim cannot update Evil's order line (cross-tenant write)
        console.log('[TEST] OrderLine: Victim cannot update Evil order line...');
        const victimUpdatesEvilOrderLine = await prisma.orderLine.updateMany({
            where: { id: evilOrderLine.id, tenantId: victimTenant.id },
            data: { qty: 999 }
        });
        if (victimUpdatesEvilOrderLine.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil OrderLine!');
        }
        console.log('✅ PASS: Victim cannot update Evil OrderLine.');

        // OrderLine: Victim cannot create OrderLine with foreign orderId/offerId (negative write → must fail)
        console.log('[TEST] OrderLine: Victim cannot create line with Evil orderId/offerId...');
        let crossTenantCreateSucceeded = false;
        try {
            await prisma.orderLine.create({
                data: {
                    tenantId: victimTenant.id,
                    orderId: evilOrder.id,
                    offerId: evilOffer.id, // Phase 4.4: composite FK (tenantId, offerId) → Offer rejects cross-tenant
                    variantId: null,
                    qty: 1,
                    priceCents: 100,
                    currency: 'UAH',
                    itemTitle: 'Cross-tenant',
                    sku: null
                }
            });
            crossTenantCreateSucceeded = true;
        } catch {
            // Expected: create with foreign orderId/offerId must fail (composite FK or orderId FK)
        }
        if (crossTenantCreateSucceeded) {
            const createdId = (await prisma.orderLine.findFirst({
                where: { tenantId: victimTenant.id, orderId: evilOrder.id },
                select: { id: true }
            }))?.id;
            if (createdId) await prisma.orderLine.delete({ where: { id: createdId } });
            throw new Error('❌ FAIL: Victim was able to create OrderLine with Evil orderId/offerId!');
        }
        console.log('✅ PASS: Victim cannot create OrderLine with foreign orderId/offerId.');

        // OrderLine: Evil tenant can read own order line
        console.log('[TEST] OrderLine: Evil Tenant can see own order line...');
        const evilSeesOwnOrderLine = await prisma.orderLine.findFirst({
            where: { id: evilOrderLine.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnOrderLine) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own OrderLine!');
        }
        console.log('✅ PASS: Evil Tenant can see their own OrderLine.');

        // OrderAdjustment: Victim cannot read Evil's adjustment (cross-tenant)
        console.log('[TEST] OrderAdjustment: Victim cannot read Evil adjustment...');
        const victimSeesEvilAdjustment = await prisma.orderAdjustment.findFirst({
            where: { id: evilOrderAdjustment.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilAdjustment) {
            throw new Error('❌ FAIL: Victim was able to read Evil OrderAdjustment!');
        }
        console.log('✅ PASS: Victim cannot see Evil OrderAdjustment.');

        // OrderAdjustment: Victim cannot update Evil's adjustment (cross-tenant write)
        console.log('[TEST] OrderAdjustment: Victim cannot update Evil adjustment...');
        const victimUpdatesEvilAdjustment = await prisma.orderAdjustment.updateMany({
            where: { id: evilOrderAdjustment.id, tenantId: victimTenant.id },
            data: { amountCents: 0 }
        });
        if (victimUpdatesEvilAdjustment.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil OrderAdjustment!');
        }
        console.log('✅ PASS: Victim cannot update Evil OrderAdjustment.');

        // OrderAdjustment: Victim cannot create adjustment with Evil orderId (negative write → must fail)
        console.log('[TEST] OrderAdjustment: Victim cannot create with Evil orderId...');
        let crossTenantAdjustmentCreateSucceeded = false;
        try {
            await prisma.orderAdjustment.create({
                data: {
                    tenantId: victimTenant.id,
                    orderId: evilOrder.id,
                    type: 'delivery_fee',
                    amountCents: 50,
                    label: 'Cross-tenant'
                }
            });
            crossTenantAdjustmentCreateSucceeded = true;
        } catch {
            // Expected: create with foreign orderId must fail (composite FK)
        }
        if (crossTenantAdjustmentCreateSucceeded) {
            const createdId = (await prisma.orderAdjustment.findFirst({
                where: { tenantId: victimTenant.id, orderId: evilOrder.id },
                select: { id: true }
            }))?.id;
            if (createdId) await prisma.orderAdjustment.delete({ where: { id: createdId } });
            throw new Error('❌ FAIL: Victim was able to create OrderAdjustment with Evil orderId!');
        }
        console.log('✅ PASS: Victim cannot create OrderAdjustment with foreign orderId.');

        // OrderAdjustment: Evil tenant can read own adjustment
        console.log('[TEST] OrderAdjustment: Evil Tenant can see own adjustment...');
        const evilSeesOwnAdjustment = await prisma.orderAdjustment.findFirst({
            where: { id: evilOrderAdjustment.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnAdjustment) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own OrderAdjustment!');
        }
        console.log('✅ PASS: Evil Tenant can see their own OrderAdjustment.');

        // Fulfillment: Victim cannot read Evil's fulfillment (cross-tenant)
        console.log('[TEST] Fulfillment: Victim cannot read Evil fulfillment...');
        const victimSeesEvilFulfillment = await prisma.fulfillment.findFirst({
            where: { id: evilFulfillment.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilFulfillment) {
            throw new Error('❌ FAIL: Victim was able to read Evil Fulfillment!');
        }
        console.log('✅ PASS: Victim cannot see Evil Fulfillment.');

        // Fulfillment: Victim cannot update Evil's fulfillment (cross-tenant write)
        console.log('[TEST] Fulfillment: Victim cannot update Evil fulfillment...');
        const victimUpdatesEvilFulfillment = await prisma.fulfillment.updateMany({
            where: { id: evilFulfillment.id, tenantId: victimTenant.id },
            data: { status: 'fulfilled' }
        });
        if (victimUpdatesEvilFulfillment.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil Fulfillment!');
        }
        console.log('✅ PASS: Victim cannot update Evil Fulfillment.');

        // Fulfillment: Victim cannot create fulfillment with Evil orderId (negative write → must fail)
        console.log('[TEST] Fulfillment: Victim cannot create with Evil orderId...');
        let crossTenantFulfillmentCreateSucceeded = false;
        try {
            await prisma.fulfillment.create({
                data: {
                    tenantId: victimTenant.id,
                    orderId: evilOrder.id,
                    type: 'delivery',
                    address: 'Evil Street',
                    status: 'pending'
                }
            });
            crossTenantFulfillmentCreateSucceeded = true;
        } catch {
            // Expected: create with foreign orderId must fail (composite FK)
        }
        if (crossTenantFulfillmentCreateSucceeded) {
            const createdId = (await prisma.fulfillment.findFirst({
                where: { tenantId: victimTenant.id, orderId: evilOrder.id },
                select: { id: true }
            }))?.id;
            if (createdId) await prisma.fulfillment.delete({ where: { id: createdId } });
            throw new Error('❌ FAIL: Victim was able to create Fulfillment with Evil orderId!');
        }
        console.log('✅ PASS: Victim cannot create Fulfillment with foreign orderId.');

        // Fulfillment: Evil tenant can read own fulfillment
        console.log('[TEST] Fulfillment: Evil Tenant can see own fulfillment...');
        const evilSeesOwnFulfillment = await prisma.fulfillment.findFirst({
            where: { id: evilFulfillment.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnFulfillment) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own Fulfillment!');
        }
        console.log('✅ PASS: Evil Tenant can see their own Fulfillment.');

        // OrderLineOption: Victim cannot read Evil's order line option (cross-tenant)
        console.log('[TEST] OrderLineOption: Victim cannot read Evil order line option...');
        const victimSeesEvilOrderLineOption = await prisma.orderLineOption.findFirst({
            where: { id: evilOrderLineOption.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilOrderLineOption) {
            throw new Error('❌ FAIL: Victim was able to read Evil OrderLineOption!');
        }
        console.log('✅ PASS: Victim cannot see Evil OrderLineOption.');

        // OrderLineOption: Victim cannot update Evil's order line option (cross-tenant write)
        console.log('[TEST] OrderLineOption: Victim cannot update Evil order line option...');
        const victimUpdatesEvilOrderLineOption = await prisma.orderLineOption.updateMany({
            where: { id: evilOrderLineOption.id, tenantId: victimTenant.id },
            data: { qty: 999 }
        });
        if (victimUpdatesEvilOrderLineOption.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil OrderLineOption!');
        }
        console.log('✅ PASS: Victim cannot update Evil OrderLineOption.');

        // OrderLineOption: Victim cannot create with Evil orderLineId/optionItemId (negative write → must fail)
        console.log('[TEST] OrderLineOption: Victim cannot create with Evil orderLineId/optionItemId...');
        let crossTenantOrderLineOptionCreateSucceeded = false;
        try {
            await prisma.orderLineOption.create({
                data: {
                    tenantId: victimTenant.id,
                    orderLineId: evilOrderLine.id,
                    optionItemId: evilOptionItem.id,
                    qty: 1,
                    priceDeltaCents: 50,
                    optionItemTitleSnapshot: 'Cross-tenant'
                }
            });
            crossTenantOrderLineOptionCreateSucceeded = true;
        } catch {
            // Expected: create with foreign orderLineId/optionItemId must fail (composite FK)
        }
        if (crossTenantOrderLineOptionCreateSucceeded) {
            const createdId = (await prisma.orderLineOption.findFirst({
                where: { tenantId: victimTenant.id, orderLineId: evilOrderLine.id },
                select: { id: true }
            }))?.id;
            if (createdId) await prisma.orderLineOption.delete({ where: { id: createdId } });
            throw new Error('❌ FAIL: Victim was able to create OrderLineOption with Evil orderLineId/optionItemId!');
        }
        console.log('✅ PASS: Victim cannot create OrderLineOption with foreign orderLineId/optionItemId.');

        // OrderLineOption: Evil tenant can read own order line option
        console.log('[TEST] OrderLineOption: Evil Tenant can see own order line option...');
        const evilSeesOwnOrderLineOption = await prisma.orderLineOption.findFirst({
            where: { id: evilOrderLineOption.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnOrderLineOption) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own OrderLineOption!');
        }
        console.log('✅ PASS: Evil Tenant can see their own OrderLineOption.');

        // Phase 4.1: Offer — Victim cannot read Evil Offer (cross-tenant)
        console.log('[TEST] Offer: Victim cannot read Evil Offer...');
        const victimSeesEvilOffer = await prisma.offer.findFirst({
            where: { id: evilOffer.id, tenantId: victimTenant.id }
        });
        if (victimSeesEvilOffer) {
            throw new Error('❌ FAIL: Victim was able to read Evil Offer!');
        }
        console.log('✅ PASS: Victim cannot see Evil Offer.');

        // Phase 4.1: Offer — Victim cannot create Offer with Evil branchId/variantId (cross-tenant write)
        console.log('[TEST] Offer: Victim cannot create with Evil branchId/variantId...');
        let crossTenantOfferCreateSucceeded = false;
        try {
            await prisma.offer.create({
                data: {
                    tenantId: victimTenant.id,
                    branchId: evilBranch.id,
                    variantId: evilVariant.id,
                    priceCents: 100,
                    currency: 'UAH',
                    isAvailable: true,
                }
            });
            crossTenantOfferCreateSucceeded = true;
        } catch {
            // Expected: FK or unique constraint — victim's tenantId with evil branch/variant must fail at app/DB level
        }
        if (crossTenantOfferCreateSucceeded) {
            const created = await prisma.offer.findFirst({
                where: { tenantId: victimTenant.id, branchId: evilBranch.id, variantId: evilVariant.id },
                select: { id: true }
            });
            if (created) await prisma.offer.delete({ where: { id: created.id } });
            throw new Error('❌ FAIL: Victim was able to create Offer with Evil branchId/variantId!');
        }
        console.log('✅ PASS: Victim cannot create Offer with foreign branchId/variantId.');

        // Offer: Evil tenant can read own offer
        console.log('[TEST] Offer: Evil Tenant can see own offer...');
        const evilSeesOwnOffer = await prisma.offer.findFirst({
            where: { id: evilOffer.id, tenantId: evilTenant.id }
        });
        if (!evilSeesOwnOffer) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own Offer!');
        }
        console.log('✅ PASS: Evil Tenant can see their own Offer.');

        // Phase 5.1: AttributeDefinition — Victim cannot read Evil definition (cross-tenant)
        console.log('[TEST] AttributeDefinition: Victim cannot read Evil definition...');
        const victimSeesEvilDef = await prisma.attributeDefinition.findFirst({
            where: { id: evilAttributeDefinition.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilDef) {
            throw new Error('❌ FAIL: Victim was able to read Evil AttributeDefinition!');
        }
        console.log('✅ PASS: Victim cannot see Evil AttributeDefinition.');

        // Phase 5.1: AttributeValue — Victim cannot read Evil value (cross-tenant)
        console.log('[TEST] AttributeValue: Victim cannot read Evil value...');
        const victimSeesEvilValue = await prisma.attributeValue.findFirst({
            where: { id: evilAttributeValue.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilValue) {
            throw new Error('❌ FAIL: Victim was able to read Evil AttributeValue!');
        }
        console.log('✅ PASS: Victim cannot see Evil AttributeValue.');

        // Phase 5.1: AttributeValue — Victim cannot create value with Evil itemId/definitionId (cross-tenant write; composite FK rejects)
        console.log('[TEST] AttributeValue: Victim cannot create with Evil itemId/definitionId...');
        let crossTenantAttrValueSucceeded = false;
        try {
            await prisma.attributeValue.create({
                data: {
                    tenantId: victimTenant.id,
                    itemId: evilCatalogItem.id,
                    definitionId: evilAttributeDefinition.id,
                    valueString: 'cross-tenant',
                    valueNumber: null,
                    valueBool: null,
                    valueDate: null,
                },
            });
            crossTenantAttrValueSucceeded = true;
        } catch {
            // Expected: composite FK (tenantId, itemId) → CatalogItem(tenantId, id) rejects cross-tenant itemId
        }
        if (crossTenantAttrValueSucceeded) {
            throw new Error('❌ FAIL: Victim was able to create AttributeValue with Evil itemId/definitionId!');
        }
        console.log('✅ PASS: Victim cannot create AttributeValue with foreign itemId/definitionId.');

        // Phase 5.1: Evil tenant can read own AttributeDefinition and AttributeValue
        console.log('[TEST] AttributeDefinition/AttributeValue: Evil Tenant can see own...');
        const evilSeesOwnDef = await prisma.attributeDefinition.findFirst({
            where: { id: evilAttributeDefinition.id, tenantId: evilTenant.id },
        });
        const evilSeesOwnValue = await prisma.attributeValue.findFirst({
            where: { id: evilAttributeValue.id, tenantId: evilTenant.id },
        });
        if (!evilSeesOwnDef || !evilSeesOwnValue) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own AttributeDefinition/AttributeValue!');
        }
        console.log('✅ PASS: Evil Tenant can see their own AttributeDefinition and AttributeValue.');

        // Phase 6.1: Integration — Victim cannot read Evil integration (cross-tenant)
        console.log('[TEST] Integration: Victim cannot read Evil integration...');
        const victimSeesEvilIntegration = await prisma.integration.findFirst({
            where: { id: evilIntegration.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilIntegration) {
            throw new Error('❌ FAIL: Victim was able to read Evil Integration!');
        }
        console.log('✅ PASS: Victim cannot see Evil Integration.');

        // Phase 6.1: IntegrationState — Victim cannot read Evil state (cross-tenant)
        console.log('[TEST] IntegrationState: Victim cannot read Evil state...');
        const victimSeesEvilState = await prisma.integrationState.findFirst({
            where: { id: evilIntegrationState.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilState) {
            throw new Error('❌ FAIL: Victim was able to read Evil IntegrationState!');
        }
        console.log('✅ PASS: Victim cannot see Evil IntegrationState.');

        // Phase 6.1: ExternalMapping — Victim cannot read Evil mapping (cross-tenant)
        console.log('[TEST] ExternalMapping: Victim cannot read Evil mapping...');
        const victimSeesEvilMapping = await prisma.externalMapping.findFirst({
            where: { id: evilExternalMapping.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilMapping) {
            throw new Error('❌ FAIL: Victim was able to read Evil ExternalMapping!');
        }
        console.log('✅ PASS: Victim cannot see Evil ExternalMapping.');

        // Phase 6.1: Integration — Victim cannot update Evil integration (write cross-tenant; DoD Phase 6)
        console.log('[TEST] Integration: Victim cannot update Evil integration...');
        const victimUpdatesEvilIntegration = await prisma.integration.updateMany({
            where: { id: evilIntegration.id, tenantId: victimTenant.id },
            data: { status: 'DISABLED' },
        });
        if (victimUpdatesEvilIntegration.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil Integration!');
        }
        console.log('✅ PASS: Victim cannot update Evil Integration.');

        // Phase 6.1 DoD: IntegrationState/ExternalMapping write cross-tenant (compound-key where → count=0)
        // Use tenantId + evil's (provider, entityType / externalId) so we test what the model guarantees.
        console.log('[TEST] IntegrationState: Victim cannot update Evil state...');
        const victimUpdatesEvilState = await prisma.integrationState.updateMany({
            where: {
                tenantId: victimTenant.id,
                provider: evilIntegration.provider,
                entityType: evilIntegrationState.entityType,
            },
            data: { cursor: {} },
        });
        if (victimUpdatesEvilState.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil IntegrationState!');
        }
        console.log('✅ PASS: Victim cannot update Evil IntegrationState.');

        console.log('[TEST] ExternalMapping: Victim cannot delete Evil mapping...');
        const victimDeletesEvilMapping = await prisma.externalMapping.deleteMany({
            where: {
                tenantId: victimTenant.id,
                provider: evilIntegration.provider,
                entityType: evilExternalMapping.entityType,
                externalId: evilExternalMapping.externalId,
            },
        });
        if (victimDeletesEvilMapping.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to delete Evil ExternalMapping!');
        }
        console.log('✅ PASS: Victim cannot delete Evil ExternalMapping.');

        // Phase 6.2: DeliveryConfigFacet — Victim cannot read Evil facet (cross-tenant)
        console.log('[TEST] DeliveryConfigFacet: Victim cannot read Evil facet...');
        const victimSeesEvilDeliveryFacet = await prisma.deliveryConfigFacet.findFirst({
            where: { id: evilDeliveryConfigFacet.id, tenantId: victimTenant.id },
        });
        if (victimSeesEvilDeliveryFacet) {
            throw new Error('❌ FAIL: Victim was able to read Evil DeliveryConfigFacet!');
        }
        console.log('✅ PASS: Victim cannot see Evil DeliveryConfigFacet.');

        // Phase 6.2: DeliveryConfigFacet — Victim cannot update Evil facet (write cross-tenant)
        console.log('[TEST] DeliveryConfigFacet: Victim cannot update Evil facet...');
        const victimUpdatesEvilDeliveryFacet = await prisma.deliveryConfigFacet.updateMany({
            where: { id: evilDeliveryConfigFacet.id, tenantId: victimTenant.id },
            data: { deliveryFee: 0 },
        });
        if (victimUpdatesEvilDeliveryFacet.count !== 0) {
            throw new Error('❌ FAIL: Victim was able to update Evil DeliveryConfigFacet!');
        }
        console.log('✅ PASS: Victim cannot update Evil DeliveryConfigFacet.');

        // Phase 6.2: Evil tenant can read own DeliveryConfigFacet
        console.log('[TEST] DeliveryConfigFacet: Evil Tenant can see own facet...');
        const evilSeesOwnDeliveryFacet = await prisma.deliveryConfigFacet.findFirst({
            where: { id: evilDeliveryConfigFacet.id, tenantId: evilTenant.id },
        });
        if (!evilSeesOwnDeliveryFacet) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own DeliveryConfigFacet!');
        }
        console.log('✅ PASS: Evil Tenant can see their own DeliveryConfigFacet.');

        // Phase 6.1: Evil tenant can read own Integration, IntegrationState, ExternalMapping
        console.log('[TEST] Integration/State/Mapping: Evil Tenant can see own...');
        const evilSeesOwnIntegration = await prisma.integration.findFirst({
            where: { id: evilIntegration.id, tenantId: evilTenant.id },
        });
        const evilSeesOwnState = await prisma.integrationState.findFirst({
            where: { id: evilIntegrationState.id, tenantId: evilTenant.id },
        });
        const evilSeesOwnMapping = await prisma.externalMapping.findFirst({
            where: { id: evilExternalMapping.id, tenantId: evilTenant.id },
        });
        if (!evilSeesOwnIntegration || !evilSeesOwnState || !evilSeesOwnMapping) {
            throw new Error('❌ FAIL: Evil Tenant cannot see their own Integration/State/Mapping!');
        }
        console.log('✅ PASS: Evil Tenant can see their own Integration, IntegrationState and ExternalMapping.');

    } catch (e) {
        console.error('\n❌ TEST FAILED:', e instanceof Error ? e.message : String(e));
        process.exitCode = 1;
    } finally {
        // CLEANUP
        console.log('\n[CLEANUP] Teardown...');
        try {
            const tenantIds: string[] = [];
            if (victimTenant) tenantIds.push(victimTenant.id);
            if (evilTenant) tenantIds.push(evilTenant.id);

            if (tenantIds.length > 0) {
                await prisma.orderLineOption.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.fulfillment.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.orderAdjustment.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.orderLine.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.offer.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.customerFavorite.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.customer.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.order.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.customDomain.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.catalogItemOptionGroup.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.optionItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.optionGroup.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.itemNutritionFacet.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.itemAllergenFacet.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.attributeValue.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.attributeDefinition.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.deliveryConfigFacet.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.externalMapping.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.integrationState.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.integration.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.itemVariant.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.catalogItem.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.categoryBranch.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.category.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.branch.deleteMany({ where: { tenantId: { in: tenantIds } } });
                await prisma.tenant.deleteMany({ where: { id: { in: tenantIds } } });
            }
            console.log('✅ [CLEANUP] Done.');
        } catch (cleanupErr) {
            console.error('❌ [CLEANUP] Failed:', cleanupErr);
            process.exitCode = 1;
        }
        await prisma.$disconnect();
    }
}

run();
