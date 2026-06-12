# Payments V2 — LiqPay secret + algorithm rotation (runbook)

## Goal
Rotate LiqPay secrets (private key) and/or inbound/outbound signature algorithms without breaking webhook ingestion or checkout/status signing.

## Preconditions
- You have access to super-admin API (JWT) and DB records.
- Secrets are stored in env (or secret manager) and referenced by name via:
  - `PaymentProvider.config.liqpay.currentSecretRef`
  - `PaymentProvider.config.liqpay.previousSecretRef` (optional, for rotation window)
- Webhook token `t=...` is configured via `PaymentProvider.config.webhookTokens`.

## Optional: local go-live rehearsal (recommended)
Run the end-to-end rehearsal (creates an isolated temporary tenant + fixtures, then cleans up):
- `cd apps/bff && pnpm run smoke:payments:rehearsal`
- If `DATABASE_URL` is not localhost:
  - `PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true pnpm run smoke:payments:rehearsal`

## Rotation strategy (zero-downtime)
We support a “current + previous” window:
- Inbound webhooks verify against:
  1) `currentSecretRef` using `signatureInAlgorithms`
  2) `previousSecretRef` using `signatureInAlgorithms` **only if not expired** (`previousValidUntil > now()` or missing)

### Step 1 — Add the new secret
1) Create a new secret value (the LiqPay private key).
2) Store it in the runtime environment (Fly/K8s secret, etc.) under a new name, e.g.:
   - `LIQPAY_PRIVATE_KEY_V2`

### Step 2 — Configure a rotation window (keep old as previous)
Patch the provider config:
- Keep the existing secret as `previousSecretRef`.
- Set `previousValidUntil` to a future timestamp (e.g. now + 7 days).
- Set the new secret as `currentSecretRef`.

Example config fragment:
```json
{
  "webhookTokens": ["<token-current>", "<token-previous>"],
  "liqpay": {
    "publicKey": "<public-key>",
    "currentSecretRef": "LIQPAY_PRIVATE_KEY_V2",
    "previousSecretRef": "LIQPAY_PRIVATE_KEY_V1",
    "previousValidUntil": "2099-01-01T00:00:00.000Z",
    "signatureInAlgorithms": ["sha1"],
    "signatureOutAlgorithm": "sha1",
    "version": 3
  }
}
```

Notes:
- While `previousValidUntil` is in the future, **both secrets must exist** in env for ACTIVE providers.
- If `previousValidUntil` is in the past, previous secret is ignored for verification (and is not required to exist).

### Step 3 — Observe
Use metrics to confirm new traffic is accepted:
- `payments_webhook_requests_total{provider="liqpay",outcome="invalid_signature"}` should **not** spike.
- `payments_webhook_requests_total{provider="liqpay",outcome="inserted"}` should continue normally.

If you keep a previous webhook token in `webhookTokens`, also watch:
- `payments_webhook_requests_total{provider="liqpay",outcome="invalid_token"}`.

### Step 4 — Remove previous secret after window
After `previousValidUntil` has passed and you are confident the old secret is no longer used:
1) Patch provider config to remove `previousSecretRef` and `previousValidUntil`.
2) Remove the old secret from env.

## Algorithm rotation (sha1 → sha3-256)
LiqPay accounts differ; do not “accept-all” by default.

### Inbound (webhook) algorithms
Update:
- `signatureInAlgorithms` from `["sha1"]` to `["sha3-256"]`

Safe migration approach:
1) Temporarily set `signatureInAlgorithms` to `["sha3-256","sha1"]`
2) Observe a stable period (no invalid_signature spikes)
3) Remove legacy algorithm: `["sha3-256"]`

### Outbound (checkout/status signing)
Update:
- `signatureOutAlgorithm` from `sha1` to `sha3-256`

Do this only after verifying your account expects sha3-256 for outgoing calls.
