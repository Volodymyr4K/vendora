# Payments V2 — Webhook token (`t=...`) rotation (runbook)

## Goal
Rotate the webhook URL token (`t=<token>`) without breaking delivery for in-flight payments whose checkout was created with the old token.

## Background
Webhook ingress endpoint:
- `POST /webhooks/payments/:provider/:providerId?t=<token>`

Each `PaymentProvider` stores an allow-list:
- `PaymentProvider.config.webhookTokens = [current, previous?]`

Ingress behavior:
- If token is missing/invalid → `404` (anti-enumeration), and **no DB insert** occurs.

Checkout behavior (important):
- When building a new checkout, BFF uses the **first token** in the array (`webhookTokens[0]`) as the “current” token for `server_url` / `webhookUrl`.
- This means rotation requires **re-ordering** (new token must become index 0).

## Rotation (zero-downtime)
### Step 1 — Generate a new token
Generate a URL-safe high-entropy token (recommendation):
- length: 32–64 chars
- charset: `A–Z a–z 0–9 _ -` (base64url-like)

## Optional: local go-live rehearsal (recommended)
Run the end-to-end rehearsal (creates an isolated temporary tenant + fixtures, then cleans up):
- `cd apps/bff && pnpm run smoke:payments:rehearsal`
- If `DATABASE_URL` is not localhost:
  - `PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true pnpm run smoke:payments:rehearsal`

### Step 2 — Add it as current, keep old as previous
Patch provider config:
- set `webhookTokens = [NEW, OLD]`

This ensures:
- new checkouts embed `t=NEW`,
- old checkouts still deliver `t=OLD` successfully.

### Step 3 — Observe
Watch metrics:
- `payments_webhook_requests_total{provider="<provider>",outcome="invalid_token"}`
  - should not spike after rotation

Also watch signature outcomes (if applicable):
- `payments_webhook_requests_total{provider="<provider>",outcome="invalid_signature"}`

### Step 4 — Remove old token after the window
After you’re confident no more in-flight payments will use the old token:
- patch `webhookTokens = [NEW]`

## Notes per provider
- **LiqPay / Mollie / monobank**: checkout requests embed webhook URL per payment, so token rotation is naturally “per new payments” once `webhookTokens[0]` changes.
- For providers configured externally with a single static webhook URL (if you ever use that mode), you must update the provider-side webhook URL to include the new token.
