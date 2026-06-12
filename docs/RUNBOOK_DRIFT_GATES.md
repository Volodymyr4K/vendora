# Runbook: Drift gates та raw-read

**Посилання з плану:** [PLATFORM_IMPLEMENTATION_PLAN_PHASED.md](./PLATFORM_IMPLEMENTATION_PLAN_PHASED.md) — Частина A (Drift policy, Raw SQL).

Цей документ збирає операційні деталі для drift-гейтів і політики raw SQL. У плані залишено мінімум і посилання сюди.

---

## MVP drift (старт)

- Перевіряти в CI: **таблиці/колонки, індекси, UNIQUE, FK, NOT NULL**.
- Allowlist raw-артефактів (partial unique index, expression index тощо): маніфест з owner і expiry; зміна — лише разом із міграцією або drift acceptance record.

## Розширення (після стабілізації)

- Fingerprint: `pg_get_indexdef` / `pg_get_constraintdef` / `pg_get_expr`; для expression/predicate — dependency-list (OID) для function, operator, type, collation, opclass, opfamily.
- Identity: function `schema.name(argtypes)->return_type`, operator `schema.op(left_type,right_type)->result_type`, type `schema.type`, collation, opclass/opfamily.
- Casts/domains: у drift-gated expr/predicate — лише явні касти; custom implicit casts заборонені; CI gate по `pg_cast` (castcontext = 'i', не pg_catalog).
- Не-pg_catalog оператори в expr/predicate — заборонені; функції — schema-qualified.
- Function body drift: для dependency function поза pg_catalog fingerprint включає function-body hash.
- Normalisation: тільки whitespace/formatting; schema-qualifier, collation, predicate, expr — частина семантики.
- Collation: у бізнес-критичних індексах/UNIQUE тільки `C`/`POSIX`; case-insensitive — нормалізована колонка + UNIQUE на ній.
- Negative tests — лише для механізмів, які реально використовуються в raw DDL проекту.

(Повний текст правил — у PLATFORM_IMPLEMENTATION_PLAN_PHASED.md, Частина A.)

---

## Raw SQL у runtime

**Мінімум (план):** raw SQL у runtime заборонено; дозволено лише міграції та адмін-скрипти під окремою роллю.

**Повна політика raw-read (якщо вводити окремий модуль):**

- Raw writes: завжди заборонені в runtime (lint + CI).
- Raw reads: лише plain SELECT без lock/side-effects; один контрольований модуль/каталог; заборонені патерни: `FOR UPDATE`, `pg_advisory_lock*`, `nextval(...)`, LOCK TABLE, SET/RESET, тощо.
- Окремий DSN і read-only DB роль; READ ONLY транзакція або `default_transaction_read_only=on`.
- Raw-read клієнт не приймає довільний SQL (лише зашиті templates + bind params); whitelist для sort/filter.
- Session timeouts: statement_timeout, lock_timeout, idle_in_transaction_session_timeout (короткі значення).
- CI: перевірка, що raw-read DSN ≠ runtime DSN і що read-only роль не має write-прав.

(Деталі — PLATFORM_IMPLEMENTATION_PLAN_PHASED.md, абзац «Raw writes (канонічно)» та далі.)
