# Payments V2 — monobank onboarding (runbook)

## Goal
Safely configure a monobank payment provider record for a tenant and enable it for checkouts + webhooks.

## What’s stored where
- Secrets are **not** stored in DB.
- DB stores a reference:
  - `PaymentProvider.credentialsRef = "<ENV_VAR_NAME>"`
- Runtime must expose the secret as an env var with that name:
  - `process.env[credentialsRef] = "<monobank token>"`

## Steps
### 1) Prepare secrets
1) Pick an env var name, e.g. `MONOBANK_TOKEN_TENANT_X`.
2) Store the tenant’s monobank token in your runtime secret manager under that name.

### Optional: local go-live rehearsal (recommended)
Run the end-to-end rehearsal (creates an isolated temporary tenant + fixtures, then cleans up):
- `cd apps/bff && pnpm run smoke:payments:rehearsal`
- If `DATABASE_URL` is not localhost:
  - `PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true pnpm run smoke:payments:rehearsal`

### 2) Create provider record (super-admin)
Create `PaymentProvider` for the tenant:
- `type=MONOBANK`
- `mode=TEST|LIVE`
- `credentialsRef=MONOBANK_TOKEN_TENANT_X`
- `config.webhookTokens=[<current>, <previous?>]`
- **Recommended status:** `DISABLED` until pubkey is provisioned (next step).

Notes:
- The API rejects `ACTIVE` without a webhook public key in config.

### 3) Provision webhook public key (pubkey refresh)
Call the refresh endpoint (super-admin scope):
- `POST /super/tenants/:tenantId/payment-providers/:providerId/monobank/refresh-pubkey`

This fetches the current monobank webhook pubkey using the token and stores it in:
- `config.monobank.webhookPublicKeysPem = [ ... ]`

### 4) Activate provider
Patch provider status to `ACTIVE`.

### 5) Observe
Watch:
- `payments_webhook_requests_total{provider="monobank",outcome="invalid_token"}`
- `payments_webhook_requests_total{provider="monobank",outcome="invalid_signature"}`
- `payments_webhook_requests_total{provider="monobank",outcome="inserted"}`

If `invalid_signature` spikes:
- confirm the pubkey refresh succeeded and is present in DB,
- confirm the correct token is stored under `credentialsRef`.
