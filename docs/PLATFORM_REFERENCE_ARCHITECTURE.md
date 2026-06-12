# Еталонна структура платформи: універсальна система під багато бізнесів

**Версія:** 1.2  
**Дата оновлення:** 28.01.2026

Концептуальна записка (без коду). Об’єднує початкову концепцію з покращеннями: **BaseType + Capabilities/Facets**, **Item vs Offer**, **платформенні модулі vs доменні capabilities**, **нормалізований кістяк замовлень**, **Location + fulfillment facets**, **інтеграції**.

**Оновлення v1.2:** Додано узгодження з поточною схемою: роль **Category–Branch (M:N)** та політика **Order–Branch** (slug vs id); у місцях з кількома варіантами зазначено «варіанти на вибір». Детально — Додаток А.

---

## 1. Базові принципи

- **Жорстка мультитенантність**
  - `tenantId` у всіх бізнесових таблицях.
  - Канонічні ключі: `@@unique([tenantId, slug])`, `[tenantId, externalId]` тощо.
  - Усі запити з бекенду — з селектором tenantId.

- **BaseType + Capabilities, без “бізнес-типів”**
  - **baseType** — малий фіксований enum, який не росте по вертикалях:
    - `GOOD` (фізичний товар)
    - `SERVICE` (послуга)
    - `DIGITAL` (цифровий товар/підписка) — опційно
    - `BUNDLE` (набір) — опційно
  - **Capabilities** — що дозволено/увімкнено:
    - на рівні **tenant** (`tenantCapabilities`): які фічі доступні цьому бізнесу.
    - на рівні **item/variant** (`itemCapabilities`): які можливості увімкнено для конкретної позиції.
  - Ключі capabilities — рядки/довідник, не enum у БД: `inventory`, `modifiers`, `nutrition`, `allergens`, `delivery`, `booking`, `fitment`, `serial_numbers`, `digital_delivery` тощо.
  - **Новий “тип бізнесу”** = вмикаєш відповідні capabilities, не додаєш новий `kind`.

- **Facets за можливостями, не за індустріями**
  - Розширення — не “FoodItemDetails / RetailItemDetails”, а **таблиці-фасети по можливостях**:
    - `ItemNutritionFacet`, `ItemAllergenFacet`, `ItemInventoryFacet`, `ItemFitmentFacet`, `ItemBarcodeFacet` тощо.
  - Інваріант: facet можна створювати лише якщо у tenant увімкнений відповідний capability і (опційно) baseType сумісний.

- **Модулі: платформенні vs доменні**
  - **Платформенні модулі (великі):** `checkout-core`, `payment-core`, `customer-core`, `auth`, `crm-lite`, `integrations` — спільна інфраструктура.
  - **Доменні capabilities (дрібні):** `inventory`, `delivery-slots`, `modifiers`, `booking`, `fitment` — перемикачі поведінки + facets + роутинг. Не плутати “модуль = бізнес”.

---

## 2. Ядро каталогу: Item vs Offer (listings)

### 2.1 CatalogItem (універсальний товар/послуга)

- **Ідентифікація:** `id`, `tenantId`, `slug` (tenant-scoped), `createdAt` / `updatedAt`.
- **Класифікація:**
  - `baseType`: `GOOD` | `SERVICE` | `DIGITAL` | `BUNDLE` (малий enum, не росте). *Є варіанти на вибір: на старті обмежити до GOOD + SERVICE, якщо DIGITAL/BUNDLE не в найближчому roadmap.*
  - Зв’язки: категорії/колекції/теги (join-таблиці). *Узгодження з поточною схемою (Category–Branch M:N) — Додаток А.*
- **Опис:** `name`/`title`, короткий `description`.
- **Статус:** `status` (ACTIVE/ARCHIVED), без прив’язки до конкретної локації.
- **Ціноутворення “база”:** опційно `basePriceCents`, `currency`, `taxCategory` — як референс; реальна ціна/наявність на рівні **Offer**.
- **Інтеграції:** `externalRef` / `posId` (якщо потрібно).

**Правило:** у CatalogItem немає “харчових” чи “книжкових” полів — лише baseType і зв’язки з facets за capabilities.

### 2.2 ItemVariant (варіації)

- `tenantId`, `itemId`, `sku` (tenant-scoped).
- Варіації: розмір/колір/фасування (атрибути або окремі поля).
- Опційно: `priceDeltaCents` відносно бази; інакше ціна на рівні Offer.
- `isAvailable` за замовчуванням; реальна наявність/залишки — на рівні Offer або InventoryFacet.

### 2.3 Offer / BranchListing (де і як продається)

- **Призначення:** один і той самий item може бути доступний лише в частині філій; ціна/наявність/залишки різні по локаціях. Delivery/retail/service визначаються саме на рівні offer (каналу продажу).

- **Поля (концептуально):**
  - `tenantId`, `branchId` (або `locationId`), `variantId` (або `itemId`).
  - `priceCents`, `currency`, `isAvailable`, `stockPolicy` (якщо inventory), `leadTime`, `visibility`, `schedule` (часи видимості).

- **Унікальність:** один variant не може мати два активні offers в одній філії з тими самими умовами (наприклад `@@unique([tenantId, branchId, variantId])` з обмеженням по типу offer).

Це розділяє “що це взагалі таке” (CatalogItem + Variant) і “де і як це продається” (Offer).

---

## 3. Facets (розширення по можливостях)

- Кожна **capability** може мати одну або кілька **facet-таблиць**.
- Приклади:
  - **nutrition** → `ItemNutritionFacet` (1:1 до item): калорії, білки, жири, вуглеводи, тощо.
  - **allergens** → `ItemAllergenFacet` (1:1 або N:M залежно від моделі).
  - **inventory** → `ItemInventoryFacet` або прив’язка до variant/offer: залишки, резерви, склади.
  - **fitment** → `ItemFitmentFacet` + `FitmentRule` (запчастини: сумісність, OEM).
  - **barcode** → `ItemBarcodeFacet`: штрихкод, тип.
  - **regulatory** → `ItemRegulatoryFacet`: сертифікати, країна походження (якщо потрібно).

- У кожній facet-таблиці: `tenantId`, зв’язок з item (або variant/offer), доменні поля.
- **Інваріанти:**
  - Facet дозволено створювати лише якщо у tenant увімкнений відповідний capability.
  - Опційно: обмеження по `baseType` (наприклад nutrition тільки для GOOD).

---

## 4. Керовані атрибути (AttributeDefinition / AttributeValue)

- **AttributeDefinition (per tenant):**
  - `tenantId`, `key`, `label`, `valueType` (string/number/bool/enum/date), валідатори.
  - `appliesToBaseTypes` (GOOD/SERVICE/…) — для яких baseType атрибут доступний.
  - `isFilterable`, `isSearchable` — індекси робити **лише для isFilterable**, щоб не роздувати БД.

- **AttributeValue (per item):**
  - Є **варіанти на вибір:** типізовані колонки (`valueString`, `valueNumber`, …) + контроль “рівно одне заповнене” **або** один JSONB з типом (простіша схема, гірші індекси для чисел/дат).
  - Індекси тільки для атрибутів з `isFilterable`.

- **Правило “facet vs attribute”:**
  - Потрібні індекси/унікальність/часті фільтри/жорстка бізнес-логіка → **facet-таблиця**.
  - Рідкісне кастомне поле без жорстких вимог → **attribute**.

---

## 5. Варіанти, опції, модифікатори

- **OptionGroup / OptionItem** (модифікатори): tenant-scoped, прив’язка до item або категорії, правила min/max, ціна дельти. Для їжі — “додати сир”, “соус”; для послуг — “експрес” тощо.
- **ItemVariant** — розмір/колір/фасування; Offer — де саме цей variant продається і за якою ціною.

---

## 6. Location (Branch) + Fulfillment facets

- **Location** (або Branch) — нейтральна сутність:
  - `tenantId`, `slug`, `name`, адреса, `timezone`, `status`, `workingSchedule`.
  - Без “branch.kind = RESTAURANT/STORE” — різниця через **capabilities і facet-конфіги**.

- **Fulfillment-конфіги (facets по можливостях):**
  - `DeliveryConfigFacet` (1:1 до Location): зони, `deliveryFee`, `freeFrom`, `etaMin`/`etaMax`, слоти (minAdvance, prepTime, slotCapacity) тощо.
  - `PickupConfigFacet`: умови самовивозу.
  - `WarehouseConfigFacet`: якщо capability `inventory` — склади, резерви.
  - `ServiceBookingConfigFacet`: якщо capability `booking` — слоти бронювання.

- Tenant з capability `delivery-slots` отримує роути/логіку слотів і використовує `DeliveryConfigFacet`; без capability — ці поля не використовуються.

---

## 7. Замовлення: нормалізований кістяк + snapshot

- **Order** — заголовок: `tenantId`, `token`, `orderNumber`, `status`, `totalCents`, посилання на філію (`branchSlug` або `branchId` — *узгодження з поточною системою в Додатку А*), `customerId`, idempotency, timestamps.
- **OrderLine** — рядки замовлення: `orderId`, `variantId` або `offerId`, `qty`, `priceCents`, `tax`, суми. Дозволяє аналітику, пошук, звіти без парсингу JSON. *У Фазі 1 — по `variantId`; у Фазі 2 канонічно — по `offerId` (політика переходу в Додатку А, якщо є фазовий план).*
- **OrderAdjustment** — знижки, доставка, комісії: `orderId`, `type`, `amountCents`, `label`.
- **Fulfillment** — окрема сутність: тип (delivery/pickup/booking), адреса/слот/посилання, статус, `requestedTime`, `fulfilledAt`. Зв’язок з Order **1:1 або 1:N** — є варіанти на вибір залежно від моделі (один спосіб доставки на замовлення vs кілька).

- **Payload (snapshot)** — залишається як “джерело правди після покупки”: незмінний JSON з повним станом замовлення на момент створення. Читання для аналітики/пошуку/помилок — по **нормалізованому кістяку** (Order + OrderLine + OrderAdjustment + Fulfillment), а не тільки по payload.

---

## 8. Інтеграції з POS/ERP

- Закласти в модель одразу, без прив’язки до одного вендора:
  - **ExternalConnection:** `tenantId`, `provider`, посилання на credentials (ref), `status`.
  - **ExternalMapping:** `tenantId`, `provider`, `entityType`, `externalId`, `internalId` — відповідність зовнішніх і внутрішніх сутностей.
  - **SyncState / SyncCursor:** інкрементальна синхронізація (курсори, lastSyncAt).

- Навіть якщо POS/ERP — “джерело” для каталогу/цін, платформі потрібні:
  - **Offer/Listing** — свої канали, своя доступність, свій UI.
  - **Snapshot замовлення** і нормалізований кістяк — гарантії multi-tenant і консистентність.

---

## 9. Ізоляція, індекси, інваріанти

- **Tenant:** усі таблиці з `tenantId`; канонічні унікальні ключі `[tenantId, …]`.
- **Індекси:** під часті запити (статистика, фільтри): Order — `[tenantId, status]`, `[tenantId, branchId, createdAt]`; CatalogItem — `[tenantId, baseType]`, `[tenantId, categoryId]`; Offer — `[tenantId, branchId]`, `[tenantId, variantId]`. AttributeValue — лише для `isFilterable`.
- **Інваріанти:** capability ↔ facet (facet існує лише при увімкненому capability); baseType ↔ допустимі facets/attributes; OrderLine/OrderAdjustment/Fulfillment узгоджені з Order.

---

## 10. Короткий звіт змін відносно початкової концепції

| Аспект | Було | Стало (еталон) |
|--------|------|-----------------|
| Тип предмета | `kind = FOOD/RETAIL/...` | `baseType` (GOOD/SERVICE/DIGITAL/BUNDLE) + **Capabilities** |
| Розширення | За індустріями (FoodItemDetails, RetailItemDetails) | **Facets за можливостями** (Nutrition, Allergen, Inventory, Fitment, Barcode…) |
| Ціна/наявність | На рівні CatalogItem або Branch | **Offer/BranchListing** між item/variant і продажем |
| Замовлення | Переважно payload | **Order + OrderLine + OrderAdjustment + Fulfillment** + payload як доповнення |
| Branch | Branch з kind або доменними полями | **Location** + **fulfillment facets** (DeliveryConfig, PickupConfig, WarehouseConfig, BookingConfig) |
| Модулі | Загальні “модулі” | **Платформенні** (checkout, payment, auth, crm-lite) vs **доменні capabilities** (inventory, delivery-slots, booking, fitment) |
| Атрибути | AttributeDefinition/Value | + `appliesToBaseTypes`, типізовані колонки, індекси лише для `isFilterable` |
| Інтеграції | externalRef/posId на сутностях | + **ExternalConnection**, **ExternalMapping**, **SyncState** |

Ця структура дає універсальну БД без росту enum по “бізнесах”, масштабування по **можливостях** (capabilities/facets), чітке розділення Item vs Offer і нормалізований кістяк замовлень при збереженні snapshot, а також чітку роль платформенних модулів і доменних capabilities.

---

## Додаток А. Узгодження з поточною системою

Цей розділ фіксує рішення щодо елементів, які в поточній схемі вже є і мають бути узгоджені з еталоном без конфліктів. Де є кілька варіантів — зазначено **варіанти на вибір**.

### А.1 Category–Branch (M:N)

**Поточна ситуація:** У системі є зв’язок «категорія–філія» (M:N): які категорії показуються в якій філії (меню/асортимент по локаціях).

**Рішення:**

- **Залишити Category–Branch M:N** і визначити його роль як **«видимість асортименту (меню) по локаціях»** — тобто *які категорії показувати в якій філії*, незалежно від наявності Offer.
- **Offer** залишається сутністю **«конкретна позиція продажу»**: (branch, variant, ціна, наявність, видимість).
- Тобто:
  - **Category–Branch** = «у цій філії показуємо ці категорії» (структура меню/фільтрів, можливо порожні категорії).
  - **Offer** = «у цій філії цей variant реально продається за такою ціною і з такою наявністю».

**Фази:**

- **Фаза 1:** Category–Branch не змінюємо, використовуємо як є.
- **Фаза 2:** Після впровадження Offer — **є два варіанти на вибір:**
  - **Варіант 1 (м’який):** Category–Branch і Offer незалежні. Можна мати категорію, видиму у філії, без жодного Offer (наприклад «скоро»), і навпаки.
  - **Варіант 2 (строгий):** Інваріант: «Offer для (branch, variant) дозволено створювати лише якщо категорія відповідного item видима в цій branch». Category–Branch тоді стає обмеженням для створення Offer. Реалізація — перевірка в коді або constraint за потреби.

**Що записати в документ/контракт:** Обраний варіант (м’який або строгий) зафіксувати після рішення команди; до того можна працювати за м’яким варіантом.

---

### А.2 Order–Branch: посилання на філію (slug vs id)

**Поточна ситуація:** У Order зберігається `branchSlug`. В еталоні згадується `branchId`/`locationId`.

**Рішення:**

- **Фаза 1:** Канонічним залишається **branchSlug** (tenant-scoped ідентифікатор, як у поточній системі). Order посилається на Branch через `branchSlug`.
- **Фаза 2:** За потреби можна додати **branchId** (FK на Branch.id) для жорсткої цілісності та простіших JOIN; `branchSlug` залишити для відображення/API. Міграція: заповнити `branchId` за існуючими `branchSlug`, далі заповнювати при нових замовленнях.

**Що записати в документ:** У Фазі 1 Order посилається на філію через `branchSlug`; у Фазі 2 за бажанням додати `branchId` з міграцією даних.

---

### А.3 Інші узгодження (коротко)

- **Tenant.features (JSON):** Вже є в схемі (`version`, `modules`, `limits`, `integrations`). `tenantCapabilities` у Фазі 1 зберігати тут (наприклад `features.capabilities` або використання `modules`) — окремої таблиці не потрібно.
- **Branch:** Поля доставки/слотів залишаються на Branch у Фазі 1; винесення в DeliveryConfigFacet — за потреби у Фазі 2.
- **Product → CatalogItem:** Міграція Product у CatalogItem (додати baseType, status, опційно basePriceCents); доменні поля типу weightG виносити у відповідні facets (наприклад nutrition) за планом фаз.
