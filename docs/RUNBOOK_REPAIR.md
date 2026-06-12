# Runbook: Repair default variant (ItemVariant)

**Посилання з плану:** [PLATFORM_IMPLEMENTATION_PLAN_PHASED.md](./PLATFORM_IMPLEMENTATION_PLAN_PHASED.md) — Фаза 2, підфаза 2.1 (ItemVariant), Canonical decisions (рішення 2).

Цей документ збирає процедуру repair для інваріанту «рівно один default variant на item».

---

## Кейси

- **Кейс A:** variants є, але жоден не default → repair обирає default домен-детерміновано: (1) variant з порожніми attributes + priceDeltaCents = 0 або null; інакше (2) найстаріший за createdAt; інакше (3) мінімальний id. Встановити isDefault=true в транзакції.
- **Кейс B:** більше одного default → в одній транзакції: (1) скинути всі isDefault=false, (2) виставити обраний true (обрати за тим самим правилом, що в Кейсі A).
- **Кейс C:** variants немає → repair створює один variant і робить його default у транзакції; SKU — за канонічним алгоритмом (префікс + encoded itemId, валідний за SKU-валідатором проекту; при колізії — до 5 спроб з детермінованим суфіксом).

## Lock

- `pg_advisory_xact_lock` на ключі, отриманому з рядка `default-variant:<tenantId>:<itemId>` (стабільний 64-bit hash). Один lock на операцію — дедлоків між repair-операціями немає.

## Після repair

- Repair не змінює tenantId і не «ремонтує» поза tenant scope.
- Варіант, створений у Кейсі C, **не стає sellable** автоматично; sellable після cutover визначається лише через Offer. Follow-up: лог/метрика `variant_without_offer_created`; зробити sellable — лише через явний адмін-флоу «Make variant sellable» (branch-scoped Offer coverage).

(Повний текст — PLATFORM_IMPLEMENTATION_PLAN_PHASED.md, підфаза 2.1, блок «Семантика repair».)
