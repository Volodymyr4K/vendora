# Platform Reference Architecture: a universal system for many business types

**Version:** 1.2
**Last updated:** 2026-01-28

A conceptual note (no code). It merges the original concept with later improvements: **BaseType + Capabilities/Facets**, **Item vs Offer**, **platform modules vs domain capabilities**, a **normalized order skeleton**, **Location + fulfillment facets**, and **integrations**.

**v1.2 update:** Added alignment with the current schema: the role of **Category–Branch (M:N)** and the **Order–Branch** policy (slug vs id); where multiple options exist, they are marked as "options to choose from". Details in Appendix A.

---

## 1. Core principles

- **Strict multi-tenancy**
  - `tenantId` on every business table.
  - Canonical keys: `@@unique([tenantId, slug])`, `[tenantId, externalId]`, etc.
  - Every backend query carries a tenantId selector.

- **BaseType + Capabilities, no "business types"**
  - **baseType** — a small fixed enum that does not grow per vertical:
    - `GOOD` (physical product)
    - `SERVICE` (service)
    - `DIGITAL` (digital product/subscription) — optional
    - `BUNDLE` (set) — optional
  - **Capabilities** — what is allowed/enabled:
    - at the **tenant** level (`tenantCapabilities`): which features this business can use.
    - at the **item/variant** level (`itemCapabilities`): which capabilities are enabled for a specific item.
  - Capability keys are strings/a registry, not a DB enum: `inventory`, `modifiers`, `nutrition`, `allergens`, `delivery`, `booking`, `fitment`, `serial_numbers`, `digital_delivery`, etc.
  - A **new "business type"** = enabling the right capabilities, not adding a new `kind`.

- **Facets by capability, not by industry**
  - Extensions are not "FoodItemDetails / RetailItemDetails" but **facet tables per capability**:
    - `ItemNutritionFacet`, `ItemAllergenFacet`, `ItemInventoryFacet`, `ItemFitmentFacet`, `ItemBarcodeFacet`, etc.
  - Invariant: a facet may only be created if the tenant has the matching capability enabled and (optionally) the baseType is compatible.

- **Modules: platform vs domain**
  - **Platform modules (large):** `checkout-core`, `payment-core`, `customer-core`, `auth`, `crm-lite`, `integrations` — shared infrastructure.
  - **Domain capabilities (small):** `inventory`, `delivery-slots`, `modifiers`, `booking`, `fitment` — behavior switches + facets + routing. Do not confuse "module = business".

---

## 2. Catalog core: Item vs Offer (listings)

### 2.1 CatalogItem (universal product/service)

- **Identity:** `id`, `tenantId`, `slug` (tenant-scoped), `createdAt` / `updatedAt`.
- **Classification:**
  - `baseType`: `GOOD` | `SERVICE` | `DIGITAL` | `BUNDLE` (small enum, never grows). *Options to choose from: at the start, restrict to GOOD + SERVICE if DIGITAL/BUNDLE are not on the near-term roadmap.*
  - Relations: categories/collections/tags (join tables). *Alignment with the current schema (Category–Branch M:N) — Appendix A.*
- **Description:** `name`/`title`, a short `description`.
- **Status:** `status` (ACTIVE/ARCHIVED), not tied to any specific location.
- **Base pricing:** optionally `basePriceCents`, `currency`, `taxCategory` — as a reference; the real price/availability lives at the **Offer** level.
- **Integrations:** `externalRef` / `posId` (if needed).

**Rule:** CatalogItem has no "food" or "book" fields — only baseType and links to capability-driven facets.

### 2.2 ItemVariant (variations)

- `tenantId`, `itemId`, `sku` (tenant-scoped).
- Variations: size/color/packaging (attributes or dedicated fields).
- Optionally: `priceDeltaCents` relative to the base; otherwise the price lives at the Offer level.
- `isAvailable` by default; real availability/stock lives at the Offer level or in an InventoryFacet.

### 2.3 Offer / BranchListing (where and how it is sold)

- **Purpose:** the same item may be available only in some branches; price/availability/stock differ per location. Delivery/retail/service semantics are defined at the offer (sales channel) level.

- **Fields (conceptually):**
  - `tenantId`, `branchId` (or `locationId`), `variantId` (or `itemId`).
  - `priceCents`, `currency`, `isAvailable`, `stockPolicy` (when inventory is enabled), `leadTime`, `visibility`, `schedule` (visibility windows).

- **Uniqueness:** one variant cannot have two active offers in the same branch under the same terms (e.g. `@@unique([tenantId, branchId, variantId])` constrained by offer type).

This separates "what the thing is" (CatalogItem + Variant) from "where and how it is sold" (Offer).

---

## 3. Facets (capability-driven extensions)

- Each **capability** may have one or more **facet tables**.
- Examples:
  - **nutrition** → `ItemNutritionFacet` (1:1 to item): calories, protein, fat, carbs, etc.
  - **allergens** → `ItemAllergenFacet` (1:1 or N:M depending on the model).
  - **inventory** → `ItemInventoryFacet` or a link to variant/offer: stock, reservations, warehouses.
  - **fitment** → `ItemFitmentFacet` + `FitmentRule` (spare parts: compatibility, OEM).
  - **barcode** → `ItemBarcodeFacet`: barcode, type.
  - **regulatory** → `ItemRegulatoryFacet`: certificates, country of origin (if needed).

- Each facet table carries: `tenantId`, a link to the item (or variant/offer), and the domain fields.
- **Invariants:**
  - A facet may only be created when the tenant has the matching capability enabled.
  - Optionally: a `baseType` restriction (e.g. nutrition only for GOOD).

---

## 4. Managed attributes (AttributeDefinition / AttributeValue)

- **AttributeDefinition (per tenant):**
  - `tenantId`, `key`, `label`, `valueType` (string/number/bool/enum/date), validators.
  - `appliesToBaseTypes` (GOOD/SERVICE/…) — which baseTypes the attribute applies to.
  - `isFilterable`, `isSearchable` — create indexes **only for isFilterable** to avoid bloating the DB.

- **AttributeValue (per item):**
  - **Options to choose from:** typed columns (`valueString`, `valueNumber`, …) with an "exactly one populated" check, **or** a single JSONB with a type tag (simpler schema, worse indexes for numbers/dates).
  - Indexes only for attributes with `isFilterable`.

- **The "facet vs attribute" rule:**
  - Needs indexes/uniqueness/frequent filters/strict business logic → a **facet table**.
  - A rare custom field with no strict requirements → an **attribute**.

---

## 5. Variants, options, modifiers

- **OptionGroup / OptionItem** (modifiers): tenant-scoped, attached to an item or category, min/max rules, price deltas. For food — "add cheese", "sauce"; for services — "express", etc.
- **ItemVariant** — size/color/packaging; the Offer defines where exactly this variant is sold and at what price.

---

## 6. Location (Branch) + fulfillment facets

- **Location** (or Branch) is a neutral entity:
  - `tenantId`, `slug`, `name`, address, `timezone`, `status`, `workingSchedule`.
  - No "branch.kind = RESTAURANT/STORE" — the difference comes from **capabilities and facet configs**.

- **Fulfillment configs (capability facets):**
  - `DeliveryConfigFacet` (1:1 to Location): zones, `deliveryFee`, `freeFrom`, `etaMin`/`etaMax`, slots (minAdvance, prepTime, slotCapacity), etc.
  - `PickupConfigFacet`: pickup terms.
  - `WarehouseConfigFacet`: with the `inventory` capability — warehouses, reservations.
  - `ServiceBookingConfigFacet`: with the `booking` capability — booking slots.

- A tenant with the `delivery-slots` capability gets the slot routes/logic and uses `DeliveryConfigFacet`; without the capability these fields are unused.

---

## 7. Orders: normalized skeleton + snapshot

- **Order** — the header: `tenantId`, `token`, `orderNumber`, `status`, `totalCents`, a branch reference (`branchSlug` or `branchId` — *alignment with the current system in Appendix A*), `customerId`, idempotency, timestamps.
- **OrderLine** — the order lines: `orderId`, `variantId` or `offerId`, `qty`, `priceCents`, `tax`, totals. Enables analytics, search and reports without parsing JSON. *Phase 1 — by `variantId`; Phase 2 canonically — by `offerId` (the migration policy is in Appendix A when a phased plan exists).*
- **OrderAdjustment** — discounts, delivery, fees: `orderId`, `type`, `amountCents`, `label`.
- **Fulfillment** — a separate entity: type (delivery/pickup/booking), address/slot/reference, status, `requestedTime`, `fulfilledAt`. The relation to Order is **1:1 or 1:N** — options to choose from depending on the model (one fulfillment method per order vs several).

- **Payload (snapshot)** remains the "source of truth after purchase": an immutable JSON with the full order state at creation time. Reads for analytics/search/debugging go through the **normalized skeleton** (Order + OrderLine + OrderAdjustment + Fulfillment), not only the payload.

---

## 8. POS/ERP integrations

- Built into the model from the start, without binding to a single vendor:
  - **ExternalConnection:** `tenantId`, `provider`, a credentials reference (ref), `status`.
  - **ExternalMapping:** `tenantId`, `provider`, `entityType`, `externalId`, `internalId` — the mapping between external and internal entities.
  - **SyncState / SyncCursor:** incremental sync (cursors, lastSyncAt).

- Even when a POS/ERP is the "source" for catalog/prices, the platform still needs:
  - **Offer/Listing** — its own channels, its own availability, its own UI.
  - The **order snapshot** and the normalized skeleton — multi-tenant guarantees and consistency.

---

## 9. Isolation, indexes, invariants

- **Tenant:** all tables carry `tenantId`; canonical unique keys are `[tenantId, …]`.
- **Indexes:** for frequent queries (stats, filters): Order — `[tenantId, status]`, `[tenantId, branchId, createdAt]`; CatalogItem — `[tenantId, baseType]`, `[tenantId, categoryId]`; Offer — `[tenantId, branchId]`, `[tenantId, variantId]`. AttributeValue — only for `isFilterable`.
- **Invariants:** capability ↔ facet (a facet exists only with the capability enabled); baseType ↔ allowed facets/attributes; OrderLine/OrderAdjustment/Fulfillment consistent with the Order.

---

## 10. Summary of changes vs the original concept

| Aspect | Before | After (reference) |
|--------|--------|-------------------|
| Item type | `kind = FOOD/RETAIL/...` | `baseType` (GOOD/SERVICE/DIGITAL/BUNDLE) + **Capabilities** |
| Extensions | Per industry (FoodItemDetails, RetailItemDetails) | **Facets per capability** (Nutrition, Allergen, Inventory, Fitment, Barcode…) |
| Price/availability | On CatalogItem or Branch | **Offer/BranchListing** between item/variant and the sale |
| Orders | Mostly payload | **Order + OrderLine + OrderAdjustment + Fulfillment** + payload as a supplement |
| Branch | Branch with kind or domain fields | **Location** + **fulfillment facets** (DeliveryConfig, PickupConfig, WarehouseConfig, BookingConfig) |
| Modules | Generic "modules" | **Platform** (checkout, payment, auth, crm-lite) vs **domain capabilities** (inventory, delivery-slots, booking, fitment) |
| Attributes | AttributeDefinition/Value | + `appliesToBaseTypes`, typed columns, indexes only for `isFilterable` |
| Integrations | externalRef/posId on entities | + **ExternalConnection**, **ExternalMapping**, **SyncState** |

This structure provides a universal DB without enum growth per "business", scaling by **capabilities** (capabilities/facets), a clear Item vs Offer separation and a normalized order skeleton alongside the snapshot, plus a clear split between platform modules and domain capabilities.

---

## Appendix A. Alignment with the current system

This section records the decisions for elements that already exist in the current schema and must align with the reference without conflicts. Where several options exist, they are marked as **options to choose from**.

### A.1 Category–Branch (M:N)

**Current state:** The system has a "category–branch" (M:N) relation: which categories are shown in which branch (menu/assortment per location).

**Decision:**

- **Keep Category–Branch M:N** and define its role as **"assortment (menu) visibility per location"** — i.e. *which categories to show in which branch*, independent of Offer existence.
- **Offer** remains the entity for a **"concrete sales position"**: (branch, variant, price, availability, visibility).
- In other words:
  - **Category–Branch** = "in this branch we show these categories" (menu/filter structure, possibly empty categories).
  - **Offer** = "in this branch this variant is actually sold at this price with this availability".

**Phases:**

- **Phase 1:** Category–Branch stays as is.
- **Phase 2:** After introducing Offer — **two options to choose from:**
  - **Option 1 (soft):** Category–Branch and Offer are independent. A category may be visible in a branch with no Offer at all (e.g. "coming soon"), and vice versa.
  - **Option 2 (strict):** Invariant: "An Offer for (branch, variant) may only be created if the corresponding item's category is visible in that branch". Category–Branch then becomes a constraint on Offer creation. Implemented as a code check or a constraint as needed.

**To record in the doc/contract:** Fix the chosen option (soft or strict) after the team decides; until then the soft option applies.

---

### A.2 Order–Branch: branch reference (slug vs id)

**Current state:** Order stores `branchSlug`. The reference model mentions `branchId`/`locationId`.

**Decision:**

- **Phase 1:** **branchSlug** stays canonical (a tenant-scoped identifier, as in the current system). Order references Branch via `branchSlug`.
- **Phase 2:** If needed, add **branchId** (FK to Branch.id) for hard integrity and simpler JOINs; keep `branchSlug` for display/API. Migration: backfill `branchId` from existing `branchSlug`, then populate it for new orders.

**To record in the doc:** In Phase 1 Order references the branch via `branchSlug`; in Phase 2 optionally add `branchId` with a data migration.

---

### A.3 Other alignments (brief)

- **Tenant.features (JSON):** Already in the schema (`version`, `modules`, `limits`, `integrations`). In Phase 1, store `tenantCapabilities` here (e.g. `features.capabilities` or reuse `modules`) — no separate table needed.
- **Branch:** Delivery/slot fields stay on Branch in Phase 1; extracting them into DeliveryConfigFacet — as needed in Phase 2.
- **Product → CatalogItem:** Migrate Product into CatalogItem (add baseType, status, optionally basePriceCents); move domain fields like weightG into the matching facets (e.g. nutrition) per the phase plan.
