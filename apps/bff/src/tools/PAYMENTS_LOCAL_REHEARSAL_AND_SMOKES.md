# Payments V2 — Local rehearsal & smokes (no real secrets)

This folder contains **safe local tools** for validating Payments V2 behavior end-to-end (DB + BullMQ/Redis + worker) without real provider credentials.

## Prereqs (local)

1) Start local Postgres + Redis:

```bash
cd /Users/v4kozachok/Desktop/vendora_step10/vendora
docker compose -f infra/docker/docker-compose.yml up -d postgres redis
```

2) Apply DB migrations to local Postgres:

```bash
DATABASE_URL='postgresql://vendora:password@127.0.0.1:5432/vendora' \
pnpm -C packages/database db:migrate:deploy
```

3) Use an isolated Redis DB for payments tooling to avoid cross-talk with other dev processes:

```bash
export REDIS_URL='redis://127.0.0.1:6379/15'
```

Alternatively (Upstash), you can provide Redis via REST envs (the code will derive a `rediss://...` URL):

```bash
export UPSTASH_REDIS_REST_URL='https://<your-upstash-host>.upstash.io'
export UPSTASH_REDIS_REST_TOKEN='<your-upstash-token>'
```

## Recommended pre-deploy (local) checks

Before deploying payments-related changes, run:

```bash
cd /Users/v4kozachok/Desktop/vendora_step10/vendora/apps/bff
pnpm gates:payments
PAYMENTS_DRILL_ALLOW=true pnpm drill:payments
```

## Go-live rehearsal (local, provider mocks)

`paymentsGoLiveRehearsal.ts` spins up a local BFF process + local provider mock servers, creates isolated DB fixtures (tenant/branch/orders/providers), exercises:

- `/payments/checkout` (LiqPay/Mollie/Monobank, mocked upstreams)
- `/webhooks/payments/*` (invalid token, valid insert, dedup)
- queue/worker processing (when Redis is enabled)
- `/metrics` sanity

Run with Redis enabled:

```bash
cd /Users/v4kozachok/Desktop/vendora_step10/vendora/apps/bff

DATABASE_URL='postgresql://vendora:password@127.0.0.1:5432/vendora' \
REDIS_URL='redis://127.0.0.1:6379' \
PAYMENTS_REHEARSAL_WITH_REDIS=true \
pnpm exec tsx src/tools/paymentsGoLiveRehearsal.ts
```

Upstash example:

```bash
cd /Users/v4kozachok/Desktop/vendora_step10/vendora/apps/bff

DATABASE_URL='postgresql://vendora:password@127.0.0.1:5432/vendora' \
PAYMENTS_REHEARSAL_WITH_REDIS=true \
UPSTASH_REDIS_REST_URL='https://<your-upstash-host>.upstash.io' \
UPSTASH_REDIS_REST_TOKEN='<your-upstash-token>' \
pnpm exec tsx src/tools/paymentsGoLiveRehearsal.ts
```

Notes:
- For **localhost Redis**, the rehearsal tool auto-isolates by defaulting to Redis DB `15` when the URL does not include a DB index.
- Override the isolation DB via `PAYMENTS_REHEARSAL_REDIS_DB=0..15` if needed.

## UNMATCHED lifecycle: local E2E smokes

All local smokes require an explicit allow-flag and a local DB:

```bash
export PAYMENTS_LOCAL_SMOKE_ALLOW=true
export DATABASE_URL='postgresql://vendora:password@127.0.0.1:5432/vendora'
export REDIS_URL='redis://127.0.0.1:6379/15'
```

Important:
- Run these smokes **one at a time** (each one starts its own BullMQ worker and can consume jobs from another smoke if run concurrently).
- If you really need parallel runs, use different Redis DB indexes (e.g. `/14`, `/15`) per smoke process.

### 1) UNMATCHED → bump (missing secret)

Creates an event, runs `webhook.process` and expects:
- `PaymentEvent.status=UNMATCHED`
- `unmatchedAttempt>=1`
- `errorCode=PROVIDER_SECRET_MISSING`

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeUnmatched.ts
```

### 2) UNMATCHED give-up (attempts exhausted)

Starts from `unmatchedAttempt=19`, runs `resync.external` and expects:
- `PaymentEvent.status=FAILED`
- `errorCode=UNMATCHED_GIVE_UP`

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeUnmatchedGiveUp.ts
```

### 3) UNMATCHED progressive backoff (transient)

Uses a local Mollie mock that returns HTTP 500 to force a transient classification and expects:
- `unmatchedAttempt` increments
- `errorCode=VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE`
- `unmatchedNextAttemptAt` is set (backoff)

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeUnmatchedBackoff.ts
```

## checkout.recover (stuck INITIATED): local E2E smokes

These validate the recovery path for transactions that are stuck in:
- `status=INITIATED`
- `externalId=null`

### 4) checkout.recover success (LiqPay, offline)

Sets a dummy LiqPay secret in env, then expects the worker to:
- set `externalId=transactionId`
- generate `checkoutUrl`
- move status to `PENDING`

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeCheckoutRecover.ts
```

### 5) checkout.recover error-path (missing secret)

Does **not** provide the referenced secret, and expects:
- tx stays `INITIATED` with no `externalId/checkoutUrl`
- `resyncAttempt` increments
- `lastErrorCode=PROVIDER_AUTH_FAILED`
- `nextResyncAt=null` (manual intervention)

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeCheckoutRecoverMissingSecret.ts
```

## resync.transaction: local E2E smokes

These validate the `resync.transaction` worker job behavior (provider verification + progressive backoff).

### 6) resync.transaction error-path (missing secret)

Does **not** provide the referenced secret, and expects:
- tx moves to `PENDING_VERIFICATION`
- `resyncAttempt` increments
- `lastErrorCode=PROVIDER_AUTH_FAILED`
- `nextResyncAt=null` (manual intervention)

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeResyncTransactionMissingSecret.ts
```

### 7) resync.transaction transient error (provider 5xx)

Uses a local Mollie mock that returns HTTP 500 and expects:
- tx moves to `PENDING_VERIFICATION`
- `resyncAttempt` increments
- `lastErrorCode=VERIFY_TRANSIENT_PROVIDER_UNAVAILABLE`
- `nextResyncAt` is set to a future time (backoff)

```bash
pnpm exec tsx src/tools/paymentsLocalSmokeResyncTransactionTransient.ts
```

## Safety

- These tools are designed to be run **locally** and include guardrails (explicit allow flags + local DB host checks).
- Prefer an isolated Redis DB (e.g. `/15`) to avoid other dev workers consuming the same BullMQ jobs.
- Do not point `DATABASE_URL` to any shared/staging/prod database for these tools.

## Prod-safe smokes (optional)

This repo also includes **prod-safe** smokes that are safe to run against shared/staging/prod because they:
- create an isolated “smoke tenant” with random slugs,
- avoid real provider API calls (by intentionally missing secrets/credentials),
- clean up after themselves (best-effort).

Important: these smokes **require** that a payments worker is running and consuming the BullMQ queue.

## Mollie go-live checklist (tenant-specific)

This tool is **read-only** (no DB changes). It validates that a tenant's Mollie provider is ready:
- provider record exists for the target `PAYMENTS_MODE`,
- provider is `ACTIVE` (by default),
- `config.webhookTokens[0]` exists and is valid,
- `credentialsRef` exists and the referenced secret is present in env,
- `WEB_BASE_URL` is present, and prints the webhook URL to paste into Mollie dashboard.

Notes:
- These checklist/discovery tools will also load secrets from `vendora/.env.local` (gitignored) **if** you run them with `DOTENV_CONFIG_PATH=.../vendora/.env`.
- By default, the webhook URL is printed with `t=<redacted>`. To print the full URL (for copy/paste), set `PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL=true` and avoid logging it.

Run (recommended env loading pattern; do not `source` `.env` directly):

```bash
export PAYMENTS_GO_LIVE_ALLOW=true
export TENANT_SLUG='<tenant-slug>'
export PAYMENTS_MODE='LIVE'   # or TEST
export PAYMENTS_GO_LIVE_PROBE_UPSTREAM=true
export PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL=false

NODE_OPTIONS='--import dotenv/config' \
DOTENV_CONFIG_PATH='/Users/v4kozachok/Desktop/vendora_step10/vendora/.env' \
pnpm exec tsx src/tools/paymentsMollieGoLiveChecklist.ts
```

Optional (deploy-connected) Mollie TEST E2E:
- `paymentsProdMollieE2E.ts` creates a dedicated test tenant + Mollie TEST provider, creates a real Mollie payment, resyncs it, and processes a synthetic webhook event (then disables the provider).
- `paymentsProdMollieManualPayPrep.ts` re-enables the provider and prints the checkout URL for manual payment.
- `paymentsProdMollieManualPayVerify.ts` verifies `paid` → `Order.financialStatus=PAID` and disables the provider again.

## Monobank go-live checklist (tenant-specific)

This tool is **read-only**. It validates:
- provider exists for `TENANT_SLUG` + `PAYMENTS_MODE`,
- `config.webhookTokens[0]` exists,
- `config.monobank.webhookPublicKeysPem` exists (required for signature verification),
- (optionally) token secret exists (via `credentialsRef`) and can fetch pubkey from monobank API (probe).

Run:

```bash
export PAYMENTS_GO_LIVE_ALLOW=true
export TENANT_SLUG='<tenant-slug>'
export PAYMENTS_MODE='LIVE'   # or TEST (internal grouping)
export PAYMENTS_GO_LIVE_REQUIRE_ACTIVE=true
export PAYMENTS_GO_LIVE_REQUIRE_SECRET=true
export PAYMENTS_GO_LIVE_PROBE_UPSTREAM=false
export PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL=false

NODE_OPTIONS='--import dotenv/config' \
DOTENV_CONFIG_PATH='/Users/v4kozachok/Desktop/vendora_step10/vendora/.env' \
pnpm exec tsx src/tools/paymentsMonobankGoLiveChecklist.ts
```

## LiqPay go-live checklist (tenant-specific)

This tool is **read-only**. It validates:
- provider exists for `TENANT_SLUG` + `PAYMENTS_MODE`,
- `config.webhookTokens[0]` exists,
- `config.liqpay.publicKey` exists,
- `config.liqpay.currentSecretRef` exists and is set in env (and previous secret if configured + not expired),
- `signatureInAlgorithms`, `signatureOutAlgorithm`, `version=3` are valid.

Run:

```bash
export PAYMENTS_GO_LIVE_ALLOW=true
export TENANT_SLUG='<tenant-slug>'
export PAYMENTS_MODE='LIVE'   # or TEST (internal grouping)
export PAYMENTS_GO_LIVE_REQUIRE_ACTIVE=true
export PAYMENTS_GO_LIVE_REQUIRE_SECRET=true
export PAYMENTS_GO_LIVE_PRINT_WEBHOOK_URL=false

NODE_OPTIONS='--import dotenv/config' \
DOTENV_CONFIG_PATH='/Users/v4kozachok/Desktop/vendora_step10/vendora/.env' \
pnpm exec tsx src/tools/paymentsLiqpayGoLiveChecklist.ts
```

## Provider “lab” setup (no real secrets)

If you do **not** have tenant credentials yet, you can still prepare a dedicated `zz-*` tenant/provider record that is “ready to accept the secret later”.

Monobank lab setup:

```bash
export PAYMENTS_GO_LIVE_ALLOW=true
export TENANT_SLUG='zz-monobank-lab'
export PAYMENTS_MODE='TEST'

NODE_OPTIONS='--import dotenv/config' \
DOTENV_CONFIG_PATH='/Users/v4kozachok/Desktop/vendora_step10/vendora/.env' \
pnpm exec tsx src/tools/paymentsMonobankLabSetup.ts
```

LiqPay lab setup:

```bash
export PAYMENTS_GO_LIVE_ALLOW=true
export TENANT_SLUG='zz-liqpay-lab'
export PAYMENTS_MODE='TEST'

NODE_OPTIONS='--import dotenv/config' \
DOTENV_CONFIG_PATH='/Users/v4kozachok/Desktop/vendora_step10/vendora/.env' \
pnpm exec tsx src/tools/paymentsLiqpayLabSetup.ts
```

Preflight (recommended before running any prod-safe smoke):

```bash
export PAYMENTS_PROD_SMOKE_ALLOW=true
pnpm exec tsx src/tools/paymentsProdSmokePreflight.ts
```

Smokes:

```bash
pnpm exec tsx src/tools/paymentsProdSmokeWebhookProcess.ts
pnpm exec tsx src/tools/paymentsProdSmokeUnmatchedResyncExternal.ts
pnpm exec tsx src/tools/paymentsProdSmokeCheckoutRecover.ts
pnpm exec tsx src/tools/paymentsProdSmokeResyncTransaction.ts
pnpm exec tsx src/tools/paymentsProdSmokeSweeperReceivedEvent.ts
pnpm exec tsx src/tools/paymentsProdSmokeSweeperInitiatedTransaction.ts
```
