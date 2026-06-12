# Documentation Index

## Architecture

- [System Overview](./SYSTEM_OVERVIEW.md) — stack, multi-tenancy model, API surface
- [Platform Reference Architecture](./PLATFORM_REFERENCE_ARCHITECTURE.md)
- [BFF Architecture & Engineering Standards](../apps/bff/ARCHITECTURE.md)
- [ADRs](../apps/bff/docs/adr/) — domain-driven architecture, observability strategy, API standards
- [Domain Events](./events.md) — event bus (Redis/BullMQ) reference
- [Upstream Tenant Isolation Contract](./UPSTREAM_HTTP_TENANT_ISOLATION_CONTRACT.md)

## Custom Domains

- [Setup Guide](./custom-domains/setup-guide.md) — step-by-step domain setup
- [Troubleshooting](./custom-domains/troubleshooting.md) — common issues and solutions
- [Super Admin API Reference](./api/super-admin-domains.md) — domain management endpoints

## Operations

- [Production Checklist](./deployment/production-checklist.md)
- [Release](../ops/runbooks/release.md) · [Rollback](../ops/runbooks/rollback.md)
- [Payments runbooks](../ops/runbooks/) — provider onboarding, webhook rotation, incident handling
- Theme guardrails: [RUNBOOK_THEMES.md](./RUNBOOK_THEMES.md)
- Drift gates: [RUNBOOK_DRIFT_GATES.md](./RUNBOOK_DRIFT_GATES.md)
- Integrations: [RUNBOOK_INTEGRATIONS.md](./RUNBOOK_INTEGRATIONS.md)
- Data repair: [RUNBOOK_REPAIR.md](./RUNBOOK_REPAIR.md)

## Monitoring

- Grafana dashboard: `infra/grafana/custom-domains-dashboard.json`
- Prometheus alerts: `infra/prometheus/alerts/custom-domains.yml`
- BFF metrics endpoint: `/metrics` (Prometheus format)
