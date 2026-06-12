# Runbook: Інтеграції (Phase 6.1)

## DoD Phase 6 — фіксація правил

### (4) Core data: master vs integration-updatable vs read-only

- **Master (внутрішні) — джерело правди в платформі:** CatalogItem, Category, Branch, ItemVariant, OptionGroup, OptionItem, Order (кістяк), Tenant, User. Інтеграція **не** перезаписує їх без явних правил.
- **Можуть оновлюватися з інтеграції за правилами:** напр. stock (якщо з’явиться facet/поле), ціни за правилами — тільки через явний контракт (які поля, який провайдер).
- **Read-only після підключення провайдера:** поки не визначено; при введенні — фіксувати в цьому runbook, щоб інтеграція не перезаписувала внутрішні зміни.

### (5) Whitelist дозволених entityType (ExternalMapping)

- **Дозволені значення:** `catalog_item`, `order`, `branch`, `item_variant` (див. `EXTERNAL_MAPPING_ENTITY_TYPES` у `apps/bff/src/services/external-mapping-resolver.ts`).
- **Невідомий entityType → 4xx** при створенні ExternalMapping.
- **Невідомий або чужий internalId → 4xx** (перевірка через `validateInternalId` на write-path).

### (6) Delete policy, конкурентність, retry/idempotency

- **Cleanup при delete:** при **hard delete** внутрішньої сутності сервісний шар викликає видалення відповідного рядка ExternalMapping. Soft delete — маппінг лишаємо (internalId ще «існує»).
- **Dangling mappings:** видалення не через сервіс (міграції, адмін SQL) лишає маппінг dangling. Канонічний cleanup — періодичний job чищення dangling (перевірка, що internalId фізично відсутній).
- **Конкурентність:** IntegrationState — один запис на (tenantId, provider, entityType); синк по різних entityType паралельно. Оновлення cursor — по цьому ключу.
- **Retry/idempotency:** при помилках синку — retry з backoff; ідемпотентність операцій синку — на рівні провайдера (напр. по externalId).
