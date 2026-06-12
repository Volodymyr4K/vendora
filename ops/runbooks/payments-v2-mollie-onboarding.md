# Payments V2 — Mollie onboarding (runbook)

## Goal
Safely configure a Mollie payment provider record for a tenant and enable it for checkouts + webhooks.

## What’s stored where
- Secrets are **not** stored in DB.
- DB stores a reference:
  - `PaymentProvider.credentialsRef = "<ENV_VAR_NAME>"`
- Runtime must expose the secret as an env var with that name:
  - `process.env[credentialsRef] = "<Mollie API key>"`

## Steps
### 1) Prepare secrets
1) Pick an env var name, e.g. `MOLLIE_API_KEY_TENANT_X`.
2) Store the tenant’s Mollie API key in your runtime secret manager under that name.

### Optional: local go-live rehearsal (recommended)
Run the end-to-end rehearsal (creates an isolated temporary tenant + fixtures, then cleans up):
- `cd apps/bff && pnpm run smoke:payments:rehearsal`
- If `DATABASE_URL` is not localhost:
  - `PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true pnpm run smoke:payments:rehearsal`

### 2) Create provider record (super-admin)
Create `PaymentProvider` for the tenant:
- `type=MOLLIE`
- `mode=TEST|LIVE`
- `status=ACTIVE` (recommended once secret is present)
- `credentialsRef=MOLLIE_API_KEY_TENANT_X`
- `config.webhookTokens=[<current>, <previous?>]`

### 3) Observe
Watch:
- `payments_webhook_requests_total{provider="mollie",outcome="invalid_token"}`
- `payments_webhook_requests_total{provider="mollie",outcome="inserted"}`

If checkouts fail or UNMATCHED does not converge:
- verify the API key exists under `credentialsRef`,
- use the internal ops endpoints to resync:
  - `POST /internal/payments/resync`
  - `POST /internal/payments/resync/external`
