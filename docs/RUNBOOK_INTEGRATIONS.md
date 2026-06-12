# Runbook: Integrations

## Definition of Done — recorded rules

### (4) Core data: master vs integration-updatable vs read-only

- **Master (internal) — the platform's source of truth:** CatalogItem, Category, Branch, ItemVariant, OptionGroup, OptionItem, Order (skeleton), Tenant, User. Integrations do **not** overwrite them without explicit rules.
- **Updatable from an integration under explicit rules:** e.g. stock (once a facet/field exists), prices under rules — only via an explicit contract (which fields, which provider).
- **Read-only after a provider is connected:** not yet defined; once introduced, record it in this runbook so the integration cannot overwrite internal changes.

### (5) Whitelist of allowed entityType (ExternalMapping)

- **Allowed values:** `catalog_item`, `order`, `branch`, `item_variant` (see `EXTERNAL_MAPPING_ENTITY_TYPES` in `apps/bff/src/services/external-mapping-resolver.ts`).
- **Unknown entityType → 4xx** on ExternalMapping creation.
- **Unknown or foreign internalId → 4xx** (checked via `validateInternalId` on the write path).

### (6) Delete policy, concurrency, retry/idempotency

- **Cleanup on delete:** on a **hard delete** of an internal entity the service layer deletes the matching ExternalMapping row. On soft delete the mapping stays (the internalId still "exists").
- **Dangling mappings:** deletes that bypass the service (migrations, admin SQL) leave the mapping dangling. The canonical cleanup is a periodic job that removes dangling mappings (verifying the internalId is physically gone).
- **Concurrency:** IntegrationState — one row per (tenantId, provider, entityType); sync across different entityTypes runs in parallel. Cursor updates use this key.
- **Retry/idempotency:** on sync errors — retry with backoff; sync operation idempotency is handled at the provider level (e.g. by externalId).
