# Payments V2 — Redis/BullMQ bring-up (runbook)

## Goal
Enable Redis-backed BullMQ for Payments V2 (queue + worker + sweepers) safely and observably.

## Background
Payments V2 uses BullMQ (Redis) for:
- `vendora-payments` queue jobs (`webhook.process`, `resync.transaction`, `resync.external`, `checkout.recover`)
- periodic sweepers to re-drive due transactions/events

Without Redis:
- webhook ingress still does **token/signature validation + DB dedup inserts**,
- but processing is best-effort (no queue/worker), so you must use internal ops endpoints (optionally sync fallback) for convergence.

## Preconditions
- Redis endpoint is reachable from BFF runtime.
- `REDIS_URL` is set (recommended) OR legacy `REDIS_HOST`/`REDIS_PORT` are set.
- Metrics are enabled (`METRICS_ENABLED=true`) to observe outcomes.

## Recommended staged enablement
Start with Redis configured but keep payments automation disabled, then enable components one by one.

### Stage 0 — Configure Redis only
Set env:
- `REDIS_URL=...`

Deploy with:
- `PAYMENTS_QUEUE_ENABLED=false`
- `PAYMENTS_WORKER_ENABLED=false`
- `PAYMENTS_SWEEPER_ENABLED=false`

Smoke:
- `GET /health` → 200
- `GET /metrics` → 200

### Stage 1 — Enable queue only (publisher)
Set:
- `PAYMENTS_QUEUE_ENABLED=true`
- `PAYMENTS_WORKER_ENABLED=false`
- `PAYMENTS_SWEEPER_ENABLED=false`

Expected behavior:
- webhook ingress can enqueue jobs (best-effort),
- but nothing is processed yet.

### Stage 2 — Enable worker (consumer)
Set:
- `PAYMENTS_QUEUE_ENABLED=true`
- `PAYMENTS_WORKER_ENABLED=true`
- optional: `PAYMENTS_WORKER_CONCURRENCY=5` (default is 5)

Expected behavior:
- queued jobs begin processing.

Recommended verification (local rehearsal, Redis mode):
- `cd apps/bff && PAYMENTS_REHEARSAL_WITH_REDIS=true REDIS_URL=... pnpm run smoke:payments:rehearsal`
- If `DATABASE_URL` is not localhost:
  - `PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true PAYMENTS_REHEARSAL_WITH_REDIS=true REDIS_URL=... pnpm run smoke:payments:rehearsal`
Note:
- rehearsal may use provider adapter base URL overrides (`*_API_BASE_URL`) for local mocks; these overrides are **dev-only** and are ignored in `NODE_ENV=production`.

Observe:
- `payments_webhook_process_total{result}` (failures must not trend upward)
- `payments_event_status_transitions_total{status_from,status_to}`
- `payments_unmatched_give_up_total{provider_type}` (**any increment is an incident**)

### Stage 3 — Enable sweepers (self-healing)
Set:
- `PAYMENTS_QUEUE_ENABLED=true`
- `PAYMENTS_SWEEPER_ENABLED=true`
- optional tuning:
  - `PAYMENTS_SWEEPER_INTERVAL_MS=60000` (default 60s)
  - `PAYMENTS_SWEEPER_BATCH_SIZE=500` (default 500)

Expected behavior:
- due `PENDING` / `PENDING_VERIFICATION` transactions and `UNMATCHED` events are re-driven automatically.

Observe:
- `payments_sweeper_due{kind}`
- `payments_sweeper_enqueued_total{job}`

## Safety / rollback
Fast rollback for Redis issues:
- set `PAYMENTS_WORKER_ENABLED=false` and `PAYMENTS_SWEEPER_ENABLED=false` (keep BFF serving)
- optionally set `PAYMENTS_QUEUE_ENABLED=false`

Webhook ingress remains safe:
- invalid token → 404 with **0 inserts**
- invalid signature → 401/403 with **0 inserts**
- dedup hits remain 2xx

## Ops fallback (no Redis)
If Redis/BullMQ is temporarily unavailable and you need to re-drive safely:
- use internal ops endpoints:
  - `POST /internal/payments/resync`
  - `POST /internal/payments/resync/external`
- optional sync fallback (use sparingly):
  - `PAYMENTS_INTERNAL_SYNC_ENABLED=true`
