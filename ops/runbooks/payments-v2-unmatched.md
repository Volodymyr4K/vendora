# Payments V2 — UNMATCHED lifecycle (ops runbook)

## What UNMATCHED means
`PaymentEvent.status=UNMATCHED` means we received a webhook event but could not link it to a `PaymentTransaction` yet.

This is expected in some races (e.g. webhook arrives before checkout persisted `externalId`) and should normally converge via:
- `resync.external` (links `externalId` → `transactionId`), then
- `resync.transaction` (verifies via provider API and advances state).

## Metrics to watch
Ingress / no-op visibility:
- `payments_webhook_requests_total{provider,outcome}`
  - `outcome="no_external_id"`: 2xx but ignored (cannot extract `externalId`)
  - `outcome="dedup_hit"`: event already exists (still converges via resync.external)
  - `outcome="invalid_token"`: token mismatch (anti-enumeration 404)
  - `outcome="invalid_signature"`: signature verification failed (401/403, 0 DB insert)

UNMATCHED lifecycle:
- `payments_event_status_transitions_total{status_from,status_to}`
  - `RECEIVED → UNMATCHED`: events that failed to match on webhook processing
  - `UNMATCHED → PROCESSED` / `UNMATCHED → FAILED`
- `payments_webhook_process_total{result}`
  - `result="unmatched"`: webhook.process could not match to a transaction
  - `result="noop_stale_event"`: out-of-order protection (monobank timestamps)
- `payments_unmatched_attempts_total{provider_type,code,transient}`
  - counts attempts in `resync.external` (DB-backed backoff + stop conditions)
- `payments_unmatched_give_up_total{provider_type}`
  - hard stop: requires manual intervention

Sweeper visibility:
- `payments_sweeper_due{kind}` (gauge) — how many due rows were found in the last tick
- `payments_sweeper_enqueued_total{job}` (counter) — how many jobs were enqueued by sweepers

## What to do when UNMATCHED is rising
1) Check if this is a benign race:
   - If `payments_event_status_transitions_total{status_from="RECEIVED",status_to="UNMATCHED"}` rises briefly but then
     `UNMATCHED → PROCESSED` rises too, it’s normal.

2) If UNMATCHED is not converging:
   - Look for `payments_unmatched_attempts_total` label `code=...` spikes:
     - `PROVIDER_AUTH_FAILED` / `PROVIDER_SECRET_MISSING` → config/secret issue
     - `VERIFY_PERMANENT_LINKAGE_MISMATCH` → wrong providerId/externalId or wrong linkage metadata
     - `VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE` / `PROVIDER_RESPONSE_UNPARSABLE` → provider outage/parsing

3) If you see `payments_unmatched_give_up_total`:
   - This means automatic retries have stopped (>=20 attempts or event age >24h).
   - Use the internal ops API to re-drive manually (below).

## Manual recovery (internal ops API)
All endpoints require header `x-internal-secret` (value = `INTERNAL_API_SECRET`).

### When Redis/BullMQ is available
These endpoints enqueue jobs:
- `POST /internal/payments/resync` with `{ "transactionId": "<uuid>" }` → `202`
- `POST /internal/payments/resync/external` with `{ "providerId": "<uuid>", "externalId": "<string>" }` → `202`

### When Redis is NOT available (sync fallback)
Enable sync mode only for controlled ops work:
- Set `PAYMENTS_INTERNAL_SYNC_ENABLED=true` (deploy-time env var).

Then the same endpoints run synchronously and return `200`:
- `POST /internal/payments/resync` → `{ queued:false, mode:"sync", result: ... }`
- `POST /internal/payments/resync/external` → `{ queued:false, mode:"sync", result: ... }`

Operational cautions:
- Sync calls will hit provider APIs; use sparingly to avoid rate limits.
- Prefer `resync/external` first for UNMATCHED events (it links), then re-run `resync` if needed.

