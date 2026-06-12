# Vendora

[![CI](https://github.com/Volodymyr4K/vendora/actions/workflows/ci.yml/badge.svg)](https://github.com/Volodymyr4K/vendora/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

**Open-source multi-tenant storefront & ordering platform.** One deployment serves many independent brands — each with its own branches, catalog, theme, payment providers, and custom domain.

Built as a production-grade monorepo: Next.js storefront, Fastify BFF, PostgreSQL with strict tenant isolation, Redis caching with stale-while-revalidate, and a full observability stack.

---

## Two tenants, one platform

The same deployment serves completely different storefronts — each tenant brings its own template, theme, catalog and locale set:

| Publishing storefront (`berlin-press`) | Food delivery storefront (`vendora-sushi-hq`) |
|---|---|
| ![Berlin Press home](docs/screenshots/berlin-press-home.png) | ![Catalog](docs/screenshots/storefront-catalog.png) |
| ![Berlin Press catalog](docs/screenshots/berlin-press-catalog.png) | ![Checkout](docs/screenshots/checkout.png) |

**Catalog → cart → checkout flow:**

![Checkout flow](docs/screenshots/checkout-flow.gif)

---

## Highlights

- **Multi-tenancy with enforced isolation** — every tenant-scoped query is guarded; CI runs dedicated isolation tests against a real database plus static gates that fail the build if a Prisma query misses a `tenantId` filter.
- **Resilient BFF layer** — TTL + stale-while-revalidate caching (memory or Redis), circuit breaker for upstream calls, request timeouts, serve-stale on failure.
- **Payments core** — provider-agnostic checkout (Mollie, LiqPay, Monobank adapters), webhook signature verification, idempotent transaction processing, event outbox.
- **Theming per tenant** — runtime theme resolution with a component-override registry, guarded by its own CI checks.
- **Custom domains** — DNS + HTTP verification flow, automated domain lifecycle, Cloudflare-proxied domain support.
- **Observability** — Prometheus metrics, OpenTelemetry tracing, Grafana dashboards, Sentry integration, structured logs with PII redaction.
- **Operations** — runbooks for release/rollback and payment incidents, k8s manifests with a canary overlay, Fly.io configs, Lighthouse CI budgets.

## Architecture

```mermaid
flowchart LR
    subgraph Clients
        B[Browser / Storefront]
        A[Admin Dashboard]
    end

    subgraph Web["apps/web — Next.js (App Router)"]
        MW[Middleware: tenant resolution]
        RSC[Server Components]
    end

    subgraph BFF["apps/bff — Fastify"]
        G[Auth & Tenant Guards]
        D[Domains: storefront / admin / super-admin / auth / internal]
        C[Cache: TTL + SWR + Circuit Breaker]
        P[Payments Core]
    end

    subgraph Data
        PG[(PostgreSQL / Prisma)]
        R[(Redis)]
    end

    B --> MW --> RSC --> G
    A --> MW
    G --> D --> PG
    D --> C --> R
    P --> PG
    D -. events .-> O[Event Outbox / BullMQ]
```

The BFF is organized by **business domain** (DDD), with layered security guards — see [apps/bff/ARCHITECTURE.md](apps/bff/ARCHITECTURE.md) and the [ADRs](apps/bff/docs/adr/).

## Stack

| Layer | Tech |
|---|---|
| Frontend | Next.js 15 (App Router, RSC), per-tenant theming |
| BFF | Fastify 5, Zod contracts, JWT auth, Swagger/OpenAPI |
| Data | PostgreSQL + Prisma, Redis (cache + BullMQ event bus) |
| Contracts | Shared Zod schemas in [`packages/contracts`](packages/contracts) |
| Testing | Vitest (500+ unit/integration tests), Playwright E2E, DB isolation tests |
| Observability | Prometheus, OpenTelemetry, Grafana, Sentry, Lighthouse CI |
| Infra | Docker Compose (dev), Kubernetes + canary overlay, Fly.io |

## Monorepo layout

```
apps/
  web/                # Next.js storefront + admin + super-admin UI
  bff/                # Fastify backend-for-frontend (domain-driven)
packages/
  contracts/          # Zod schemas + shared types (API contracts)
  database/           # Prisma schema, migrations, seeds, isolation tests
  tenant-resolver/    # Domain → tenant resolution (DNS / HTTP verification)
  shared/             # Cross-cutting utilities
infra/                # docker-compose, k8s manifests, Grafana, Prometheus
docs/                 # Architecture, runbooks, API reference
ops/                  # Release / rollback / payments runbooks
scripts/              # CI helpers, guardrail checks
```

## Quick start

Requirements: Node.js 20+, pnpm 9+, Docker.

```bash
pnpm install

# Start Postgres + Redis
docker compose -f infra/docker/docker-compose.yml up -d postgres redis

# Set up the database
echo 'DATABASE_URL=postgresql://vendora:password@localhost:5432/vendora?schema=public' > packages/database/.env
pnpm --filter @vendora/database exec prisma migrate deploy
pnpm --filter @vendora/database db:seed

# Run everything (BFF on :4000, web on :3000)
pnpm dev
```

Or use the single-command dev environment (infra + BFF + web with readiness ordering):

```bash
pnpm dev:all
```

## Quality gates

```bash
pnpm verify
```

Runs the full local gate: contract build, typecheck across the workspace, lint, theme guardrails, 500+ BFF unit/integration tests, static tenant-isolation checks (`check:tenant-prisma`), and live DB isolation tests. The same gate runs in [CI](.github/workflows/ci.yml).

```bash
pnpm ci        # build + unit + Playwright E2E + Lighthouse budgets
```

## Multi-tenant model

```
Tenant (brand) ─┬─ Branch (location) ─┬─ Catalog (categories, items, variants, options)
                │                     ├─ Working schedule, delivery config
                │                     └─ Orders / fulfillment
                ├─ Theme + component overrides
                ├─ Payment providers (per-tenant credentials)
                ├─ Custom domains (verified via DNS or HTTP)
                └─ Users with per-module permissions
```

Isolation is enforced at three levels: route guards (tenant context required), query-level `tenantId` filters verified by a static CI gate, and runtime isolation tests that attempt cross-tenant access against a real database.

## Documentation

- [System overview](docs/SYSTEM_OVERVIEW.md)
- [Platform reference architecture](docs/PLATFORM_REFERENCE_ARCHITECTURE.md)
- [BFF architecture & engineering standards](apps/bff/ARCHITECTURE.md)
- [Domain events](docs/events.md)
- [Custom domains: setup](docs/custom-domains/setup-guide.md) · [troubleshooting](docs/custom-domains/troubleshooting.md)
- [Runbooks](ops/runbooks/) — release, rollback, payments operations
- [Production checklist](docs/deployment/production-checklist.md)

## License

[MIT](LICENSE)
