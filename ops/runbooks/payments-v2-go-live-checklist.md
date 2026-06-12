# Payments V2 — Go-live checklist (TEST → LIVE)

## Scope
This checklist covers making Payments V2 operational for a tenant/provider mode, with minimal risk and clear rollback.

## 1) Preconditions (must be true)
- DB migrations applied (Payment Core V2 tables + indexes exist).
- `WEB_BASE_URL` and `BFF_BASE_URL` are correct for the environment.
- `INTERNAL_API_SECRET` is set (for ops resync endpoints).
- Redis/BullMQ is configured if you plan to enable queue/worker/sweepers:
  - see `ops/runbooks/payments-v2-redis-bringup.md`
- Provider secrets exist in runtime env (by ref name), and **are not stored in DB**:
  - Mollie: `PaymentProvider.credentialsRef` → env var exists (`test_...` or `live_...`)
  - monobank: `PaymentProvider.credentialsRef` → env var exists (token)
  - LiqPay: `PaymentProvider.config.liqpay.currentSecretRef` (and optional previous) → env vars exist

## 2) Provider record sanity (super-admin)
For the target tenant:
- Confirm you have exactly one `ACTIVE` provider per `(type, mode)` (DB uniqueness enforces this).
- Confirm `config.webhookTokens` is set and ordered:
  - `webhookTokens[0]` is the “current” token embedded into newly created checkouts.
  - keep `[new, old]` during rotation windows.

### monobank-only
- Ensure webhook pubkey is provisioned before `ACTIVE`:
  - `POST /super/tenants/:tenantId/payment-providers/:providerId/monobank/refresh-pubkey`

## 3) Switch to LIVE safely
Recommended sequence:
1) Create a **LIVE** provider record in `DISABLED` (or keep it `ACTIVE` only if you are sure secrets/config are present).
2) Validate secrets exist in runtime env for that provider record (the API enforces this on `ACTIVE`).
3) Activate provider (`status=ACTIVE`).

## 4) Smoke checks (no customer impact)
- `GET /health` → 200
- `GET /metrics` → 200
- Webhook ingress anti-enumeration:
  - invalid provider → 404
  - invalid token → 404 (and should increment `payments_webhook_requests_total{outcome="invalid_token"}`)

### Optional: local go-live rehearsal (recommended)
Runs an end-to-end rehearsal against the configured DB (creates an isolated temporary tenant + fixtures, then cleans up).

- `cd apps/bff && pnpm run smoke:payments:rehearsal`
- If `DATABASE_URL` points to a non-localhost DB host, you must opt in:
  - `PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true pnpm run smoke:payments:rehearsal`
- Note: do **not** run this against production DB unless you explicitly accept temporary writes (it cleans up on success/failure).

If Redis/BullMQ is available and you want to verify end-to-end automation (queue + worker + sweepers):
- `cd apps/bff && PAYMENTS_REHEARSAL_WITH_REDIS=true REDIS_URL=... pnpm run smoke:payments:rehearsal`
- Note: rehearsal may use provider adapter base URL overrides (`*_API_BASE_URL`) for local mocks; these overrides are **dev-only** and are ignored in `NODE_ENV=production`.

## 5) First real payments window (observe 15–30 minutes)
Watch these metrics:
- `payments_webhook_requests_total{provider,outcome}`
  - `outcome="invalid_signature"` must stay ~0 (for providers with signatures)
  - `outcome="invalid_token"` must stay ~0 (token rotation mistakes)
  - `outcome="no_external_id"` must stay ~0 (payload parsing issues)
- `payments_event_status_transitions_total{status_from="RECEIVED",status_to="UNMATCHED"}`
  - brief spikes may be ok (race), but it must converge to `UNMATCHED → PROCESSED`
- `payments_unmatched_give_up_total{provider_type}`
  - **any increment is an incident**

If UNMATCHED does not converge:
- Use internal ops endpoints to re-drive:
  - `POST /internal/payments/resync`
  - `POST /internal/payments/resync/external`
- If Redis/BullMQ is unavailable, you may temporarily enable sync fallback:
  - `PAYMENTS_INTERNAL_SYNC_ENABLED=true`

## 6) Rollback
Fast rollback is always:
- Set provider `status=DISABLED` for the problematic `(type, mode)`.
- Keep webhook ingress alive (it is safe: token+signature checks + dedup + 2xx no-op policies).
