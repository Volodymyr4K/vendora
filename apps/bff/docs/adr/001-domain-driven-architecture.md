# ADR-001: Domain-Driven Architecture

## Status
Accepted

## Date
2026-01-17

## Context
The application was originally structured with a mix of flat routes and technical layers (`controllers`, `models`). As the application grew to support multiple actors (Customer, Admin, Super Admin) and extensive business logic (Tenants, Checkout, Inventory), the "Spaghetti Routing" became unmanageable.

## Decision
We decided to reorganize the codebase into a **Domain-Based Architecture**.
Code is grouped by **Business Context** first, then by technical function.

### Structure
```
src/domains/
├── storefront/    # Public customer facing (Menu, Cart)
├── admin/         # Tenant admin dashboard (Products, Orders)
├── super-admin/   # Platform owner tools
├── auth/          # Authentication flows
└── infra/         # Health, Metrics
```

## Consequences

### Positive
*   **Isolation:** Changes in `storefront` (e.g., Menu UI) rarely break `admin` (e.g., Inventory Management).
*   **Cognitive Load:** Developers only need to load one domain context into their head.
*   **Scalability:** Domains can be easily extracted into separate microservices in the future.

### Negative
*   **Duplication:** Some types or utils might need to be shared explicitly or duplicated to avoid coupling.
*   **Boilerplate:** Requires slightly more setup for each new feature (routes file + registration).
