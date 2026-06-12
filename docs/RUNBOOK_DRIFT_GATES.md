# Runbook: Drift gates & raw reads

Operational details for the schema drift gates and the raw SQL policy.

---

## MVP drift (initial scope)

- Check in CI: **tables/columns, indexes, UNIQUE, FK, NOT NULL**.
- Allowlist of raw artifacts (partial unique indexes, expression indexes, etc.): a manifest with an owner and an expiry; changes only land together with a migration or a drift acceptance record.

## Extensions (after stabilization)

- Fingerprint: `pg_get_indexdef` / `pg_get_constraintdef` / `pg_get_expr`; for expression/predicate indexes — a dependency list (OIDs) covering function, operator, type, collation, opclass, opfamily.
- Identity: function `schema.name(argtypes)->return_type`, operator `schema.op(left_type,right_type)->result_type`, type `schema.type`, collation, opclass/opfamily.
- Casts/domains: drift-gated expr/predicate may use explicit casts only; custom implicit casts are forbidden; a CI gate over `pg_cast` (castcontext = 'i', excluding pg_catalog).
- Non-pg_catalog operators in expr/predicate are forbidden; functions must be schema-qualified.
- Function body drift: for dependency functions outside pg_catalog the fingerprint includes a function-body hash.
- Normalization: whitespace/formatting only; schema qualifier, collation, predicate and expr are part of the semantics.
- Collation: business-critical indexes/UNIQUE constraints use `C`/`POSIX` only; case-insensitive lookups go through a normalized column with a UNIQUE constraint on it.
- Negative tests — only for mechanisms actually used in the project's raw DDL.

---

## Raw SQL at runtime

**Minimum (policy):** raw SQL at runtime is forbidden; only migrations and admin scripts under a dedicated role are allowed.

**Full raw-read policy (if a dedicated module is introduced):**

- Raw writes: always forbidden at runtime (lint + CI).
- Raw reads: plain SELECT only, no locks/side effects; a single controlled module/directory; forbidden patterns: `FOR UPDATE`, `pg_advisory_lock*`, `nextval(...)`, LOCK TABLE, SET/RESET, etc.
- A separate DSN and a read-only DB role; READ ONLY transactions or `default_transaction_read_only=on`.
- The raw-read client accepts no arbitrary SQL (only built-in templates + bind params); a whitelist for sort/filter.
- Session timeouts: statement_timeout, lock_timeout, idle_in_transaction_session_timeout (short values).
- CI: verify that the raw-read DSN differs from the runtime DSN and that the read-only role has no write privileges.
