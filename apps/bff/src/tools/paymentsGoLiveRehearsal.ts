import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@vendora/database";
import dotenv from "dotenv";
import { runPaymentsProdSmokePreflight } from "./_paymentsProdSmokePreflightHelper.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function readReqBody(req: import("node:http").IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const c of req) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

function base64Url(input: Buffer) {
  return input
    .toString("base64")
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}

function randomToken(len: number) {
  // url-safe chars: A-Za-z0-9_-
  const bytes = crypto.randomBytes(len);
  return base64Url(bytes).slice(0, len);
}

function liqpaySigSha1(privateKey: string, dataBase64: string) {
  return crypto.createHash("sha1").update(`${privateKey}${dataBase64}${privateKey}`).digest("base64");
}

async function waitForOk(url: string, attempts: number) {
  for (let i = 0; i < attempts; i += 1) {
    try {
      const res = await fetch(url);
      if (res.ok) return;
    } catch {
      // ignore
    }
    await delay(250);
  }
  throw new Error(`Server did not become ready: ${url}`);
}

async function waitForPaymentEventStatus(args: {
  prisma: PrismaClient;
  paymentEventId: string;
  desired: Array<"PROCESSED" | "FAILED" | "UNMATCHED">;
  timeoutMs: number;
}) {
  const deadline = Date.now() + args.timeoutMs;
  while (Date.now() < deadline) {
    const ev = await args.prisma.paymentEvent.findUnique({
      where: { id: args.paymentEventId },
      select: { id: true, status: true, processedAt: true },
    });
    if (ev && args.desired.includes(ev.status as any)) return ev;
    await delay(100);
  }
  const last = await args.prisma.paymentEvent.findUnique({
    where: { id: args.paymentEventId },
    select: { id: true, status: true, processedAt: true },
  });
  throw new Error(`Timed out waiting for PaymentEvent ${args.paymentEventId} to reach ${args.desired.join("|")} (last=${last?.status ?? "missing"})`);
}

async function getPaymentEventDebug(prisma: PrismaClient, id: string) {
  return prisma.paymentEvent.findUnique({
    where: { id },
    select: {
      id: true,
      tenantId: true,
      providerId: true,
      externalId: true,
      status: true,
      errorCode: true,
      processedAt: true,
    },
  });
}

function extractMetricLines(metricsText: string, prefix: string) {
  return metricsText
    .split("\n")
    .filter((l) => l.startsWith(prefix))
    .slice(0, 50);
}

function resolveRedisUrlForRehearsal(parsed: Record<string, string>, explicitEnv: NodeJS.ProcessEnv) {
  // Prefer explicit process env over values coming from an env file.
  // Important: REST envs must also win over parsed REDIS_URL, otherwise operators
  // can get "stuck" on an old URL in the env file.
  const directEnv = (explicitEnv.REDIS_URL ?? "").trim();
  if (directEnv) return withRehearsalRedisDbIsolation(directEnv);

  const upstashUrlEnv = (explicitEnv.UPSTASH_REDIS_URL ?? "").trim();
  if (upstashUrlEnv) return upstashUrlEnv;

  const restUrlEnv = (explicitEnv.UPSTASH_REDIS_REST_URL ?? "").trim();
  const restTokenEnv = (explicitEnv.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  if (restUrlEnv && restTokenEnv) {
    let host = "";
    try {
      host = new URL(restUrlEnv).hostname;
    } catch {
      host = "";
    }

    const portRaw = (explicitEnv.UPSTASH_REDIS_PORT ?? "").trim();
    const port = portRaw ? Number(portRaw) : 6379;
    if (!host || !Number.isFinite(port) || port <= 0) return "";

    return `rediss://default:${encodeURIComponent(restTokenEnv)}@${host}:${port}`;
  }

  const directFile = (parsed.REDIS_URL ?? "").trim();
  if (directFile) return withRehearsalRedisDbIsolation(directFile);

  const upstashUrlFile = (parsed.UPSTASH_REDIS_URL ?? "").trim();
  if (upstashUrlFile) return upstashUrlFile;

  const restUrl = (parsed.UPSTASH_REDIS_REST_URL ?? "").trim();
  const restToken = (parsed.UPSTASH_REDIS_REST_TOKEN ?? "").trim();
  if (!restUrl || !restToken) return "";

  let host = "";
  try {
    host = new URL(restUrl).hostname;
  } catch {
    host = "";
  }

  const portRaw = (process.env.UPSTASH_REDIS_PORT ?? parsed.UPSTASH_REDIS_PORT ?? "").trim();
  const port = portRaw ? Number(portRaw) : 6379;
  if (!host || !Number.isFinite(port) || port <= 0) return "";

  return `rediss://default:${encodeURIComponent(restToken)}@${host}:${port}`;
}

function withRehearsalRedisDbIsolation(url: string) {
  // When running locally, it's easy to have another dev process listening to the default BullMQ queue
  // and accidentally consuming jobs created by this rehearsal tool (or vice versa).
  // Default to DB 15 for localhost Redis to isolate rehearsal runs.
  try {
    const u = new URL(url);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") return url;

    const host = (u.hostname ?? "").trim().toLowerCase();
    const isLocal = host === "localhost" || host === "127.0.0.1" || host === "::1";
    if (!isLocal) return url;

    const rawDb = (process.env.PAYMENTS_REHEARSAL_REDIS_DB ?? "").trim();
    const db = rawDb ? Number(rawDb) : 15;
    if (!Number.isFinite(db) || db < 0 || db > 15) return url;

    // If URL already specifies a db (e.g. /0 or /15), keep it.
    const path = (u.pathname ?? "").trim();
    if (/^\/\d+$/.test(path)) return url;

    u.pathname = `/${db}`;
    return u.toString();
  } catch {
    return url;
  }
}

function extractRedisDbIndex(url: string): number | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "redis:" && u.protocol !== "rediss:") return null;
    const path = (u.pathname ?? "").trim();
    if (!/^\/\d+$/.test(path)) return null;
    const n = Number(path.slice(1));
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

async function main() {
  // Snapshot the *explicit* environment passed to this tool before we call dotenv.config(),
  // because dotenv mutates process.env (and may set REDIS_URL from the env file).
  const explicitEnv = { ...process.env };

  const rootEnvPath = process.env.VENDORA_ROOT_ENV_PATH ?? "../../.env";
  const parsed = dotenv.config({ path: rootEnvPath }).parsed ?? {};

  // Explicit process env must win over values coming from an env file.
  const dbUrl = process.env.DATABASE_URL ?? parsed.DATABASE_URL;
  const internalSecret = process.env.INTERNAL_API_SECRET ?? parsed.INTERNAL_API_SECRET;
  assert(dbUrl, "DATABASE_URL missing (set VENDORA_ROOT_ENV_PATH or DATABASE_URL)");
  assert(internalSecret && internalSecret.length >= 32, "INTERNAL_API_SECRET missing/too short");

  const dbHost = new URL(dbUrl).hostname;
  const allowRemote = (process.env.PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB ?? "").trim().toLowerCase() === "true";
  if (dbHost !== "localhost" && dbHost !== "127.0.0.1" && !allowRemote) {
    throw new Error(
      `Refusing to run against remote DB host (${dbHost}). Set PAYMENTS_REHEARSAL_ALLOW_REMOTE_DB=true to proceed.`
    );
  }

  const PORT = Number(process.env.PORT ?? 4131);
  assert(Number.isFinite(PORT) && PORT > 0, "Invalid PORT");
  const BFF_BASE = `http://127.0.0.1:${PORT}`;

  const withRedis =
    (process.env.PAYMENTS_REHEARSAL_WITH_REDIS ?? "")
      .trim()
      .toLowerCase() === "true";
  const redisUrl = resolveRedisUrlForRehearsal(parsed, explicitEnv);
  if (withRedis && !redisUrl) {
    throw new Error("PAYMENTS_REHEARSAL_WITH_REDIS=true requires REDIS_URL or UPSTASH_REDIS_URL/UPSTASH_REDIS_REST_URL+TOKEN");
  }
  const redisUrlRaw = (process.env.REDIS_URL ?? parsed.REDIS_URL ?? "").trim();
  const redisLocalIsolationApplied = withRedis && !!redisUrlRaw && withRehearsalRedisDbIsolation(redisUrlRaw) !== redisUrlRaw;
  const redisDbIndex = withRedis && redisUrl ? extractRedisDbIndex(redisUrl) : null;

  // Local Mollie mock server (to rehearse Mollie checkout without hitting real Mollie API).
  // BFF will call it via MOLLIE_API_BASE_URL.
  const mollieCalls: Array<{ headers: Record<string, string | string[] | undefined>; body: any }> = [];
  let mollieLastCreateBody: any = null;
  const mollieServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "POST" && url.pathname === "/v2/payments") {
        const raw = await readReqBody(req);
        let parsedBody: any = undefined;
        try {
          parsedBody = JSON.parse(raw.toString("utf8"));
        } catch {
          parsedBody = undefined;
        }
        mollieCalls.push({ headers: req.headers, body: parsedBody });
        mollieLastCreateBody = parsedBody;

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id: "tr_rehearsal_checkout_1",
            _links: { checkout: { href: "https://mollie.local/checkout/tr_rehearsal_checkout_1" } },
          })
        );
        return;
      }

      const paymentMatch = /^\/v2\/payments\/([^/]+)$/.exec(url.pathname);
      if (req.method === "GET" && paymentMatch) {
        const id = decodeURIComponent(paymentMatch[1] || "");
        if (id !== "tr_rehearsal_checkout_1") {
          res.statusCode = 404;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify({ status: 404, error: "NOT_FOUND" }));
          return;
        }

        const amount = mollieLastCreateBody?.amount ?? { currency: "UAH", value: "56.78" };
        const metadata = mollieLastCreateBody?.metadata ?? {};

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            id,
            status: "open",
            amount,
            metadata,
          })
        );
        return;
      }

      const refundsMatch = /^\/v2\/payments\/([^/]+)\/refunds$/.exec(url.pathname);
      if (req.method === "GET" && refundsMatch) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ _embedded: { refunds: [] } }));
        return;
      }

      const chargebacksMatch = /^\/v2\/payments\/([^/]+)\/chargebacks$/.exec(url.pathname);
      if (req.method === "GET" && chargebacksMatch) {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ _embedded: { chargebacks: [] } }));
        return;
      }

      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
    } catch {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "INTERNAL" }));
    }
  });

  await new Promise<void>((resolve) => mollieServer.listen(0, "127.0.0.1", () => resolve()));
  const molliePort = (mollieServer.address() as any).port as number;
  const mollieBaseUrl = `http://127.0.0.1:${molliePort}`;

  // Local Monobank mock server (to rehearse Monobank checkout without hitting real Monobank API).
  // BFF will call it via MONOBANK_API_BASE_URL.
  const monobankCalls: Array<{ headers: Record<string, string | string[] | undefined>; body: any }> = [];
  let monobankPubkeyPem = "";
  let monobankLastCreateBody: any = null;
  const monobankServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");

      if (req.method === "GET" && url.pathname === "/api/merchant/pubkey") {
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ key: monobankPubkeyPem }));
        return;
      }

      if (req.method === "POST" && url.pathname === "/api/merchant/invoice/create") {
        const raw = await readReqBody(req);
        let parsedBody: any = undefined;
        try {
          parsedBody = JSON.parse(raw.toString("utf8"));
        } catch {
          parsedBody = undefined;
        }
        monobankCalls.push({ headers: req.headers, body: parsedBody });
        monobankLastCreateBody = parsedBody;

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            invoiceId: "inv_rehearsal_checkout_1",
            pageUrl: "https://mono.local/pay/inv_rehearsal_checkout_1",
          })
        );
        return;
      }

      if (req.method === "GET" && url.pathname === "/api/merchant/invoice/status") {
        const invoiceId = url.searchParams.get("invoiceId") ?? "";
        const nowSec = Math.floor(Date.now() / 1000);
        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            invoiceId,
            status: "created",
            amount: Number(monobankLastCreateBody?.amount ?? 9012),
            ccy: Number(monobankLastCreateBody?.ccy ?? 980),
            reference: String(monobankLastCreateBody?.merchantPaymInfo?.reference ?? ""),
            createdDate: nowSec,
            modifiedDate: nowSec,
            cancelList: [],
          })
        );
        return;
      }

      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
    } catch {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "INTERNAL" }));
    }
  });

  await new Promise<void>((resolve) => monobankServer.listen(0, "127.0.0.1", () => resolve()));
  const monobankPort = (monobankServer.address() as any).port as number;
  const monobankBaseUrl = `http://127.0.0.1:${monobankPort}`;

  // Local LiqPay mock server (to rehearse LiqPay status verification without hitting real LiqPay API).
  // BFF will call it via LIQPAY_API_BASE_URL.
  const liqpayServer = createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://127.0.0.1");
      if (req.method === "POST" && url.pathname === "/api/request") {
        const raw = (await readReqBody(req)).toString("utf8");
        const params = new URLSearchParams(raw);
        const data = params.get("data") ?? "";
        let orderId = "";
        try {
          const decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as any;
          orderId = typeof decoded?.order_id === "string" ? decoded.order_id : "";
        } catch {
          orderId = "";
        }

        res.statusCode = 200;
        res.setHeader("content-type", "application/json");
        res.end(
          JSON.stringify({
            status: "processing",
            amount: "12.34",
            currency: "UAH",
            order_id: orderId,
          })
        );
        return;
      }

      res.statusCode = 404;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "NOT_FOUND" }));
    } catch {
      res.statusCode = 500;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ error: "INTERNAL" }));
    }
  });

  await new Promise<void>((resolve) => liqpayServer.listen(0, "127.0.0.1", () => resolve()));
  const liqpayPort = (liqpayServer.address() as any).port as number;
  const liqpayBaseUrl = `http://127.0.0.1:${liqpayPort}`;

  // Rehearsal tenant fixtures
  const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const tenantSlug = `payments-rehearsal-${suffix}`;
  const tenantName = `Payments Rehearsal ${suffix}`;
  const branchSlug = `rehearsal-branch-${suffix}`;
  const orderToken = `ot_${suffix}`;
  const orderId = `ORD-REH-${suffix}`;
  const mollieOrderToken = `ot_mollie_${suffix}`;
  const mollieOrderId = `ORD-REH-MOLLIE-${suffix}`;
  const monobankOrderToken = `ot_monobank_${suffix}`;
  const monobankOrderId = `ORD-REH-MONOBANK-${suffix}`;

  const webhookTokenCurrent = randomToken(40);
  const liqpaySecretEnvName = "LIQPAY_PRIVATE_KEY_REHEARSAL";
  const liqpayPrivateKey = `priv_${suffix}`; // dummy (only used for signature creation/verification in rehearsal)
  const liqpayPublicKey = `pub_${suffix}`;
  const mollieApiKeyEnvName = "MOLLIE_API_KEY_REHEARSAL";
  const monobankTokenEnvName = "MONOBANK_TOKEN_REHEARSAL";

  const prisma = new PrismaClient({ datasources: { db: { url: dbUrl } } });

  let tenantId: string | null = null;
  let branchId: string | null = null;
  let orderDbId: string | null = null;
  let mollieOrderDbId: string | null = null;
  let monobankOrderDbId: string | null = null;
  let providerId: string | null = null;
  let mollieProviderId: string | null = null;
  let monobankProviderId: string | null = null;
  let txId: string | null = null;
  let mollieTxId: string | null = null;
  let monobankTxId: string | null = null;

  const processEnvStrings = Object.fromEntries(
    Object.entries(process.env)
      .filter(([, v]) => v != null)
      .map(([k, v]) => [k, String(v)])
  );

  const childEnv: Record<string, string> = {
    ...parsed,
    ...processEnvStrings,
    DATABASE_URL: dbUrl,
    INTERNAL_API_SECRET: internalSecret,

    PORT: String(PORT),
    NODE_ENV: "development",
    LOG_LEVEL: "warn",

    UPSTREAM_MODE: "mock",
    UPSTREAM_DISCOVERY_ENABLED: "false",

    CACHE_MODE: "memory",
    REDIS_URL: withRedis ? redisUrl : "",
    EVENT_BUS_ENABLED: "false",

    PAYMENTS_MODE: "TEST",
    PAYMENTS_QUEUE_ENABLED: withRedis ? "true" : "false",
    PAYMENTS_WORKER_ENABLED: withRedis ? "true" : "false",
    PAYMENTS_SWEEPER_ENABLED: withRedis ? "true" : "false",
    PAYMENTS_INTERNAL_SYNC_ENABLED: "false",

    WEB_BASE_URL: processEnvStrings.WEB_BASE_URL ?? parsed.WEB_BASE_URL ?? "http://localhost:3000",
    JWT_SECRET: "rehearsal-jwt-secret-please-change",
    COOKIE_SECRET: "rehearsal-cookie-secret-please-change",
    [liqpaySecretEnvName]: liqpayPrivateKey,
    [mollieApiKeyEnvName]: "test_mollie_key",
    MOLLIE_API_BASE_URL: mollieBaseUrl,
    [monobankTokenEnvName]: "test_monobank_token",
    MONOBANK_API_BASE_URL: monobankBaseUrl,
    LIQPAY_API_BASE_URL: liqpayBaseUrl,
  };

  const child = spawn("pnpm", ["exec", "tsx", "src/index.ts"], {
    cwd: process.cwd(),
    env: childEnv,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let childLogs = "";
  child.stdout.on("data", (d) => {
    childLogs += d.toString("utf8");
  });
  child.stderr.on("data", (d) => {
    childLogs += d.toString("utf8");
  });

  const cleanup = async () => {
    child.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => child.on("exit", resolve)), delay(2000)]);
    child.kill("SIGKILL");

    mollieServer.close();
    monobankServer.close();
    liqpayServer.close();

    // DB cleanup: delete in safe order (events → providers → orders → branches → tenants)
    if (tenantId) {
      await prisma.paymentEvent.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.paymentTransaction.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.paymentProvider.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.order.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.branch.deleteMany({ where: { tenantId } }).catch(() => {});
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => {});
    }
    await prisma.$disconnect().catch(() => {});
  };

  try {
    // 1) Create fixtures directly in DB (isolated tenant)
    const tenant = await prisma.tenant.create({ data: { slug: tenantSlug, name: tenantName } });
    tenantId = tenant.id;

    const branch = await prisma.branch.create({
      data: {
        tenantId,
        slug: branchSlug,
        cityName: "Rehearsal City",
        phones: [],
        zones: [],
      },
    });
    branchId = branch.id;

    // keep tenant defaults reasonable (some flows expect default branch)
    await prisma.tenant.update({
      where: { id: tenantId },
      data: { branchesMode: "SINGLE", defaultBranchId: branchId },
    });

    const order = await prisma.order.create({
      data: {
        tenantId,
        token: orderToken,
        orderId,
        branchSlug,
        branchId,
        status: "created",
        total: 1234,
        currency: "UAH",
        payload: {},
      },
    });
    orderDbId = order.id;

    const orderMollie = await prisma.order.create({
      data: {
        tenantId,
        token: mollieOrderToken,
        orderId: mollieOrderId,
        branchSlug,
        branchId,
        status: "created",
        total: 5678,
        currency: "UAH",
        payload: {},
      },
    });
    mollieOrderDbId = orderMollie.id;

    const orderMonobank = await prisma.order.create({
      data: {
        tenantId,
        token: monobankOrderToken,
        orderId: monobankOrderId,
        branchSlug,
        branchId,
        status: "created",
        total: 9012,
        currency: "UAH",
        payload: {},
      },
    });
    monobankOrderDbId = orderMonobank.id;

    const provider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "LIQPAY",
        mode: "TEST",
        status: "ACTIVE",
        config: {
          webhookTokens: [webhookTokenCurrent],
          liqpay: {
            publicKey: liqpayPublicKey,
            currentSecretRef: liqpaySecretEnvName,
            signatureInAlgorithms: ["sha1"],
            signatureOutAlgorithm: "sha1",
            version: 3,
          },
        },
      },
      select: { id: true },
    });
    providerId = provider.id;

    // 2) Start BFF and wait for readiness
    // When Redis is enabled, startup may take longer due to Redis connections (pubsub + BullMQ).
    await waitForOk(`${BFF_BASE}/health`, withRedis ? 160 : 40);
    if (withRedis) {
      // Health endpoint being OK does not guarantee BullMQ worker readiness. Preflight ensures
      // the payments worker is actually consuming the queue before we assert webhook processing.
      await runPaymentsProdSmokePreflight({ redisUrl, timeoutMs: 25_000 });
    }

    // 3) Checkout (creates PaymentTransaction + checkoutUrl)
    const idemKey = `idem-${suffix}`;
    const checkoutRes = await fetch(`${BFF_BASE}/payments/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-slug": tenantSlug,
        "idempotency-key": idemKey,
      },
      body: JSON.stringify({ orderToken }),
    });
    assert(checkoutRes.status === 200, `Expected 200 from /payments/checkout, got ${checkoutRes.status}`);
    const checkoutBody = (await checkoutRes.json()) as { transactionId: string; checkoutUrl: string; status: string };
    txId = checkoutBody.transactionId;
    assert(checkoutBody.status === "PENDING", `Expected checkout status=PENDING, got ${checkoutBody.status}`);
    assert(checkoutBody.checkoutUrl.includes("/checkout/liqpay?"), "Expected checkoutUrl to be liqpay redirect page");

    // Inspect embedded webhook URL token inside LiqPay data payload
    const checkoutUrl = new URL(checkoutBody.checkoutUrl);
    const liqpayData = checkoutUrl.searchParams.get("data");
    assert(liqpayData, "Missing data param in checkoutUrl");
    const decodedCheckout = JSON.parse(Buffer.from(liqpayData, "base64").toString("utf8")) as any;
    const serverUrl = String(decodedCheckout?.server_url ?? "");
    assert(serverUrl.includes(`/api/webhooks/payments/liqpay/${providerId}`), "Expected server_url to include providerId");
    assert(serverUrl.includes(`t=${encodeURIComponent(webhookTokenCurrent)}`), "Expected server_url to include current webhook token");

    // 4) Webhook ingest: invalid token → 404, no insert
    const beforeCount = await prisma.paymentEvent.count({ where: { tenantId, providerId } });
    const invalidTokenRes = await fetch(`${BFF_BASE}/webhooks/payments/liqpay/${providerId}?t=wrong`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: liqpayData, signature: "bad" }).toString(),
    });
    assert(invalidTokenRes.status === 404, `Expected 404 for invalid token, got ${invalidTokenRes.status}`);
    const afterInvalidTokenCount = await prisma.paymentEvent.count({ where: { tenantId, providerId } });
    assert(afterInvalidTokenCount === beforeCount, "Expected no DB inserts on invalid token");

    // 5) Webhook ingest: valid signature → insert
    const webhookPayloadObj = { order_id: txId };
    const webhookData = Buffer.from(JSON.stringify(webhookPayloadObj), "utf8").toString("base64");
    const webhookSig = liqpaySigSha1(liqpayPrivateKey, webhookData);

    const okRes = await fetch(`${BFF_BASE}/webhooks/payments/liqpay/${providerId}?t=${encodeURIComponent(webhookTokenCurrent)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: webhookData, signature: webhookSig }).toString(),
    });
    assert(okRes.status === 200, `Expected 200 for valid webhook, got ${okRes.status}`);

    const afterOkCount = await prisma.paymentEvent.count({ where: { tenantId, providerId } });
    assert(afterOkCount === beforeCount + 1, "Expected exactly one PaymentEvent insert on valid webhook");

    const liqpayInserted = await prisma.paymentEvent.findFirst({
      where: { tenantId, providerId, externalId: String(txId) },
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    });
    assert(liqpayInserted?.id, "Expected to find inserted liqpay PaymentEvent");
    if (withRedis) {
      await waitForPaymentEventStatus({
        prisma,
        paymentEventId: liqpayInserted.id,
        desired: ["PROCESSED", "FAILED"],
        timeoutMs: 10_000,
      });
      const debug = await getPaymentEventDebug(prisma, liqpayInserted.id);
      assert(
        debug?.status === "PROCESSED" && !debug?.errorCode,
        `Expected liqpay event processed without errorCode, got ${JSON.stringify(debug)}`
      );
    }

    // 6) Dedup: same webhook again → still 200, no extra insert
    const okRes2 = await fetch(`${BFF_BASE}/webhooks/payments/liqpay/${providerId}?t=${encodeURIComponent(webhookTokenCurrent)}`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ data: webhookData, signature: webhookSig }).toString(),
    });
    assert(okRes2.status === 200, `Expected 200 for dedup webhook, got ${okRes2.status}`);

    const afterDedupCount = await prisma.paymentEvent.count({ where: { tenantId, providerId } });
    assert(afterDedupCount === afterOkCount, "Expected dedup to prevent extra PaymentEvent inserts");

    // 7) Mollie webhook ingest + checkout rehearsal: invalid token → 404, no insert
    const mollieTokenCurrent = randomToken(40);
    const mollieProvider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "MOLLIE",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: mollieApiKeyEnvName,
        config: {
          webhookTokens: [mollieTokenCurrent],
        },
      },
      select: { id: true },
    });
    mollieProviderId = mollieProvider.id;

    const mollieBeforeCount = await prisma.paymentEvent.count({ where: { tenantId, providerId: mollieProviderId } });
    const mollieInvalidTokenRes = await fetch(`${BFF_BASE}/webhooks/payments/mollie/${mollieProviderId}?t=wrong`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ id: "tr_rehearsal_1" }).toString(),
    });
    assert(mollieInvalidTokenRes.status === 404, `Expected 404 for mollie invalid token, got ${mollieInvalidTokenRes.status}`);
    const mollieAfterInvalid = await prisma.paymentEvent.count({ where: { tenantId, providerId: mollieProviderId } });
    assert(mollieAfterInvalid === mollieBeforeCount, "Expected no DB inserts on mollie invalid token");

    // 8) Mollie checkout: uses local Mollie mock (no real upstream calls)
    const mollieCheckoutRes = await fetch(`${BFF_BASE}/payments/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-slug": tenantSlug,
        "idempotency-key": `idem-mollie-${suffix}`,
      },
      body: JSON.stringify({ orderToken: mollieOrderToken, providerId: mollieProviderId }),
    });
    assert(mollieCheckoutRes.status === 200, `Expected 200 from /payments/checkout (mollie), got ${mollieCheckoutRes.status}`);
    const mollieCheckoutBody = (await mollieCheckoutRes.json()) as { transactionId: string; checkoutUrl: string; status: string };
    mollieTxId = mollieCheckoutBody.transactionId;
    assert(mollieCheckoutBody.status === "PENDING", `Expected mollie checkout status=PENDING, got ${mollieCheckoutBody.status}`);
    assert(
      mollieCheckoutBody.checkoutUrl === "https://mollie.local/checkout/tr_rehearsal_checkout_1",
      "Expected mollie checkoutUrl from mock server"
    );

    assert(mollieCalls.length === 1, `Expected exactly 1 Mollie create call, got ${mollieCalls.length}`);
    const call = mollieCalls[0]!;
    const idemHeader = (call.headers["idempotency-key"] as string | undefined) ?? undefined;
    assert(idemHeader === mollieTxId, "Expected Mollie idempotency-key header == transactionId");
    const authHeader = (call.headers["authorization"] as string | undefined) ?? "";
    assert(authHeader.toLowerCase().startsWith("bearer "), "Expected Mollie Authorization: Bearer ...");
    assert(
      String(call.body?.metadata?.transactionId ?? "") === mollieTxId,
      "Expected Mollie metadata.transactionId == transactionId"
    );
    assert(
      String(call.body?.metadata?.orderDbId ?? "") === String(mollieOrderDbId ?? ""),
      "Expected Mollie metadata.orderDbId == orderDbId"
    );

    // 9) Mollie webhook ingest: valid token → insert; repeat → dedup
    const mollieExternalId = "tr_rehearsal_checkout_1";
    const mollieOkRes = await fetch(
      `${BFF_BASE}/webhooks/payments/mollie/${mollieProviderId}?t=${encodeURIComponent(mollieTokenCurrent)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: mollieExternalId }).toString(),
      }
    );
    assert(mollieOkRes.status === 200, `Expected 200 for mollie valid webhook, got ${mollieOkRes.status}`);

    const mollieAfterOk = await prisma.paymentEvent.count({ where: { tenantId, providerId: mollieProviderId } });
    assert(mollieAfterOk === mollieBeforeCount + 1, "Expected exactly one mollie PaymentEvent insert on valid webhook");

    const mollieInserted = await prisma.paymentEvent.findFirst({
      where: { tenantId, providerId: mollieProviderId, externalId: mollieExternalId },
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    });
    assert(mollieInserted?.id, "Expected to find inserted mollie PaymentEvent");
    if (withRedis) {
      await waitForPaymentEventStatus({
        prisma,
        paymentEventId: mollieInserted.id,
        desired: ["PROCESSED", "FAILED"],
        timeoutMs: 10_000,
      });
      const debug = await getPaymentEventDebug(prisma, mollieInserted.id);
      assert(
        debug?.status === "PROCESSED" && !debug?.errorCode,
        `Expected mollie event processed without errorCode, got ${JSON.stringify(debug)}`
      );
    }

    const mollieOkRes2 = await fetch(
      `${BFF_BASE}/webhooks/payments/mollie/${mollieProviderId}?t=${encodeURIComponent(mollieTokenCurrent)}`,
      {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ id: mollieExternalId }).toString(),
      }
    );
    assert(mollieOkRes2.status === 200, `Expected 200 for mollie dedup webhook, got ${mollieOkRes2.status}`);

    const mollieAfterDedup = await prisma.paymentEvent.count({ where: { tenantId, providerId: mollieProviderId } });
    assert(mollieAfterDedup === mollieAfterOk, "Expected mollie dedup to prevent extra PaymentEvent inserts");

    // 10) Monobank checkout + webhook ingest (single provider due to @@unique([tenantId, type, mode]))
    const monobankWebhookTokenCurrent = randomToken(40);
    const { publicKey: monoPubPem, privateKey: monoPrivPem } = crypto.generateKeyPairSync("rsa", {
      modulusLength: 2048,
      publicKeyEncoding: { type: "spki", format: "pem" },
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
    });
    monobankPubkeyPem = monoPubPem;

    const monobankProvider = await prisma.paymentProvider.create({
      data: {
        tenantId,
        type: "MONOBANK",
        mode: "TEST",
        status: "ACTIVE",
        credentialsRef: monobankTokenEnvName,
        config: {
          webhookTokens: [monobankWebhookTokenCurrent],
          monobank: {
            webhookPublicKeysPem: [monoPubPem],
          },
        },
      },
      select: { id: true },
    });
    monobankProviderId = monobankProvider.id;

    const monobankCheckoutRes = await fetch(`${BFF_BASE}/payments/checkout`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-tenant-slug": tenantSlug,
        "idempotency-key": `idem-monobank-${suffix}`,
      },
      body: JSON.stringify({ orderToken: monobankOrderToken, providerId: monobankProviderId }),
    });
    assert(monobankCheckoutRes.status === 200, `Expected 200 from /payments/checkout (monobank), got ${monobankCheckoutRes.status}`);
    const monobankCheckoutBody = (await monobankCheckoutRes.json()) as { transactionId: string; checkoutUrl: string; status: string };
    monobankTxId = monobankCheckoutBody.transactionId;
    assert(monobankCheckoutBody.status === "PENDING", `Expected monobank checkout status=PENDING, got ${monobankCheckoutBody.status}`);
    assert(
      monobankCheckoutBody.checkoutUrl === "https://mono.local/pay/inv_rehearsal_checkout_1",
      "Expected monobank checkoutUrl from mock server"
    );

    assert(monobankCalls.length === 1, `Expected exactly 1 Monobank create call, got ${monobankCalls.length}`);
    const monoCall = monobankCalls[0]!;
    const tokenHeader = (monoCall.headers["x-token"] as string | undefined) ?? "";
    assert(tokenHeader === "test_monobank_token", "Expected Monobank x-token header from env secret");
    assert(Number(monoCall.body?.amount) === 9012, "Expected Monobank amount == order total minor units");
    assert(Number(monoCall.body?.ccy) === 980, "Expected Monobank ccy for UAH == 980");
    assert(
      String(monoCall.body?.merchantPaymInfo?.reference ?? "") === monobankTxId,
      "Expected Monobank reference == transactionId"
    );
    const hookUrl = String(monoCall.body?.webHookUrl ?? "");
    assert(hookUrl.includes(`/api/webhooks/payments/monobank/${monobankProviderId}`), "Expected Monobank webHookUrl to include providerId");
    assert(hookUrl.includes(`t=${encodeURIComponent(monobankWebhookTokenCurrent)}`), "Expected Monobank webHookUrl to include webhook token");

    const monoPayload = {
      invoiceId: "inv_rehearsal_checkout_1",
      createdDate: Math.floor(Date.now() / 1000),
    };
    const monoRaw = Buffer.from(JSON.stringify(monoPayload), "utf8");
    const monoSig = crypto.sign("sha256", monoRaw, monoPrivPem).toString("base64");

    const monoBeforeCount = await prisma.paymentEvent.count({ where: { tenantId, providerId: monobankProviderId } });
    const monoInvalidTokenRes = await fetch(`${BFF_BASE}/webhooks/payments/monobank/${monobankProviderId}?t=wrong`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-sign": monoSig },
      body: monoRaw,
    });
    assert(monoInvalidTokenRes.status === 404, `Expected 404 for monobank invalid token, got ${monoInvalidTokenRes.status}`);
    const monoAfterInvalidToken = await prisma.paymentEvent.count({ where: { tenantId, providerId: monobankProviderId } });
    assert(monoAfterInvalidToken === monoBeforeCount, "Expected no DB inserts on monobank invalid token");

    // 11) Monobank webhook ingest: invalid signature → 403, no insert
    const monoInvalidSigRes = await fetch(
      `${BFF_BASE}/webhooks/payments/monobank/${monobankProviderId}?t=${encodeURIComponent(monobankWebhookTokenCurrent)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-sign": "bad" },
        body: monoRaw,
      }
    );
    assert(monoInvalidSigRes.status === 403, `Expected 403 for monobank invalid signature, got ${monoInvalidSigRes.status}`);
    const monoAfterInvalidSig = await prisma.paymentEvent.count({ where: { tenantId, providerId: monobankProviderId } });
    assert(monoAfterInvalidSig === monoBeforeCount, "Expected no DB inserts on monobank invalid signature");

    // 12) Monobank webhook ingest: valid signature → insert; repeat → dedup
    const monoOkRes = await fetch(
      `${BFF_BASE}/webhooks/payments/monobank/${monobankProviderId}?t=${encodeURIComponent(monobankWebhookTokenCurrent)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-sign": monoSig },
        body: monoRaw,
      }
    );
    assert(monoOkRes.status === 200, `Expected 200 for monobank valid webhook, got ${monoOkRes.status}`);
    const monoAfterOk = await prisma.paymentEvent.count({ where: { tenantId, providerId: monobankProviderId } });
    assert(monoAfterOk === monoBeforeCount + 1, "Expected exactly one monobank PaymentEvent insert on valid webhook");

    const monobankInserted = await prisma.paymentEvent.findFirst({
      where: { tenantId, providerId: monobankProviderId, externalId: monoPayload.invoiceId },
      orderBy: { receivedAt: "desc" },
      select: { id: true },
    });
    assert(monobankInserted?.id, "Expected to find inserted monobank PaymentEvent");
    if (withRedis) {
      await waitForPaymentEventStatus({
        prisma,
        paymentEventId: monobankInserted.id,
        desired: ["PROCESSED", "FAILED"],
        timeoutMs: 10_000,
      });
      const debug = await getPaymentEventDebug(prisma, monobankInserted.id);
      assert(
        debug?.status === "PROCESSED" && !debug?.errorCode,
        `Expected monobank event processed without errorCode, got ${JSON.stringify(debug)}`
      );
    }

    const monoOkRes2 = await fetch(
      `${BFF_BASE}/webhooks/payments/monobank/${monobankProviderId}?t=${encodeURIComponent(monobankWebhookTokenCurrent)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-sign": monoSig },
        body: monoRaw,
      }
    );
    assert(monoOkRes2.status === 200, `Expected 200 for monobank dedup webhook, got ${monoOkRes2.status}`);
    const monoAfterDedup = await prisma.paymentEvent.count({ where: { tenantId, providerId: monobankProviderId } });
    assert(monoAfterDedup === monoAfterOk, "Expected monobank dedup to prevent extra PaymentEvent inserts");

    // 13) Metrics sanity
    const metricsRes = await fetch(`${BFF_BASE}/metrics`);
    assert(metricsRes.status === 200, `Expected 200 for /metrics, got ${metricsRes.status}`);
    const metricsText = await metricsRes.text();
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="liqpay",outcome="inserted"}'),
      "Expected inserted outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="liqpay",outcome="dedup_hit"}'),
      "Expected dedup_hit outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="liqpay",outcome="invalid_token"}'),
      "Expected invalid_token outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="mollie",outcome="inserted"}'),
      "Expected mollie inserted outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="mollie",outcome="dedup_hit"}'),
      "Expected mollie dedup_hit outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="mollie",outcome="invalid_token"}'),
      "Expected mollie invalid_token outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="monobank",outcome="inserted"}'),
      "Expected monobank inserted outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="monobank",outcome="dedup_hit"}'),
      "Expected monobank dedup_hit outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="monobank",outcome="invalid_token"}'),
      "Expected monobank invalid_token outcome in metrics"
    );
    assert(
      metricsText.includes('payments_webhook_requests_total{provider="monobank",outcome="invalid_signature"}'),
      "Expected monobank invalid_signature outcome in metrics"
    );
    if (withRedis) {
      const hasProcessed = metricsText.includes('payments_webhook_process_total{result="processed"}');
      if (!hasProcessed) {
        const lines = extractMetricLines(metricsText, "payments_webhook_process_total{");
        throw new Error(
          `Expected webhook.process processed result in metrics (Redis mode). Seen:\n${lines.join("\n") || "(none)"}`
        );
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          tenantSlug,
          tenantId,
          redis: withRedis ? { enabled: true, db: redisDbIndex, localIsolationApplied: redisLocalIsolationApplied } : { enabled: false },
          providerId,
          mollieProviderId,
          monobankProviderId,
          orderToken,
          orderDbId,
          transactionId: txId,
          mollieOrderToken,
          mollieOrderDbId,
          mollieTxId,
          monobankOrderToken,
          monobankOrderDbId,
          monobankTxId,
        },
        null,
        2
      )
    );
  } catch (err) {
    console.error(String((err as any)?.message ?? err));
    // Print a small hint but avoid leaking env/secrets
    const lines = childLogs.split("\n");
    const hint = lines
      .filter((l) =>
        l.includes("[REDIS]") ||
        l.includes("[PubSub]") ||
        l.includes("[Payments") ||
        l.includes("BullMQ") ||
        l.includes("Server listening") ||
        l.includes("Prisma") ||
        l.includes("CRITICAL") ||
        l.includes("FATAL") ||
        l.includes("ERROR")
      )
      .slice(-80)
      .join("\n");
    if (hint) console.error(hint);
    else {
      const tail = lines.slice(-80).join("\n");
      if (tail.trim()) console.error(tail);
    }
    process.exitCode = 1;
  } finally {
    await cleanup();
  }
}

void main();
