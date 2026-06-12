# Runbook: Repair default variant (ItemVariant)

The repair procedure for the invariant "exactly one default variant per item".

---

## Cases

- **Case A:** variants exist but none is default → repair picks the default deterministically: (1) the variant with empty attributes and priceDeltaCents = 0 or null; otherwise (2) the oldest by createdAt; otherwise (3) the minimal id. Set isDefault=true in a transaction.
- **Case B:** more than one default → in a single transaction: (1) reset all isDefault=false, (2) set the chosen one to true (picked by the same rule as Case A).
- **Case C:** no variants → repair creates one variant and makes it the default in a transaction; the SKU follows the canonical algorithm (prefix + encoded itemId, valid under the project's SKU validator; on collision — up to 5 attempts with a deterministic suffix).

## Lock

- `pg_advisory_xact_lock` on a key derived from the string `default-variant:<tenantId>:<itemId>` (a stable 64-bit hash). One lock per operation — no deadlocks between repair operations.

## After repair

- Repair never changes tenantId and never "repairs" outside the tenant scope.
- A variant created in Case C does **not** become sellable automatically; after cutover, sellability is defined only via an Offer. Follow-up: a `variant_without_offer_created` log/metric; making it sellable goes only through the explicit "Make variant sellable" admin flow (branch-scoped Offer coverage).
