import type { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import type { SecretResolver } from "../../services/secrets.js";
import { monobankFetchPubkeyPem } from "../../services/payments/providers/monobank.js";
import { paymentsWebhookRequestsTotal } from "../../lib/metrics.js";

const PAYMENT_WEBHOOK_PROVIDERS = new Set(["mollie", "monobank", "liqpay"]);
const monobankPubkeyRefreshNextAttemptAtMs = new Map<string, number>();
const MONOBANK_PUBKEY_REFRESH_THROTTLE_MS = 5 * 60 * 1000;

type PrismaLike = {
  paymentProvider: {
    findFirst: (args: any) => Promise<any>;
    update?: (args: any) => Promise<any>;
  };
  paymentEvent: {
    create: (args: any) => Promise<any>;
  };
};

type Deps = {
  prisma: PrismaLike;
  secrets: SecretResolver;
  paymentsQueue?: Pick<
    import("../../services/payments/payments-queue.js").PaymentsQueue,
    "enqueueWebhookProcess" | "enqueueResyncExternal"
  > | undefined;
};

function sha256Hex(input: Buffer | string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function computeDedupKey(args: {
  externalId: string;
  eventId?: string | undefined;
  eventType?: string | undefined;
  providerEventCreatedAt?: Date | undefined;
  payloadHash: string;
}) {
  const { externalId, eventId, eventType, providerEventCreatedAt, payloadHash } = args;
  const dedupInput =
    eventId
      ? eventId
      : (externalId && providerEventCreatedAt)
        ? `${externalId}:${providerEventCreatedAt.toISOString()}`
        : (externalId && eventType)
          ? `${externalId}:${eventType}`
          : `${externalId}:${payloadHash}`;
  return sha256Hex(dedupInput);
}

function safeJsonParse(raw: Buffer): unknown | undefined {
  try {
    return JSON.parse(raw.toString("utf8"));
  } catch {
    return undefined;
  }
}

function providerTypeFromParam(provider: string) {
  const p = provider.toLowerCase();
  if (p === "mollie") return "MOLLIE";
  if (p === "monobank") return "MONOBANK";
  if (p === "liqpay") return "LIQPAY";
  return undefined;
}

function isUniqueViolation(err: any) {
  return err?.code === "P2002";
}

function isValidWebhookToken(config: any, token: string | undefined) {
  const webhookTokens = config?.webhookTokens;
  return !!token && Array.isArray(webhookTokens) && webhookTokens.includes(token);
}

function liqpayExpectedSignatureBase64(args: { privateKey: string; data: string; algorithm: "sha1" | "sha3-256" }) {
  const payload = `${args.privateKey}${args.data}${args.privateKey}`;
  return crypto.createHash(args.algorithm).update(payload).digest("base64");
}

function isValidLiqpaySignature(args: {
  config: any;
  secrets: SecretResolver;
  data: string;
  signature: string;
}) {
  const liqpay = args.config?.liqpay ?? {};
  const algorithms: string[] = Array.isArray(liqpay.signatureInAlgorithms) ? liqpay.signatureInAlgorithms : [];
  const currentRef: string | undefined = liqpay.currentSecretRef;
  const previousRef: string | undefined = liqpay.previousSecretRef;
  const previousValidUntil: string | undefined = liqpay.previousValidUntil;

  const now = Date.now();
  const allowPrevious =
    typeof previousRef === "string" &&
    (!previousValidUntil || (Number.isFinite(Date.parse(previousValidUntil)) && Date.parse(previousValidUntil) > now));

  const refsToTry = [
    ...(typeof currentRef === "string" ? [currentRef] : []),
    ...(allowPrevious ? [previousRef!] : []),
  ];

  for (const ref of refsToTry) {
    const privateKey = args.secrets.resolve(ref);
    if (!privateKey) continue;

    for (const algo of algorithms) {
      if (algo !== "sha1" && algo !== "sha3-256") continue;
      const expected = liqpayExpectedSignatureBase64({ privateKey, data: args.data, algorithm: algo });
      if (expected === args.signature) return true;
    }
  }

  return false;
}

function verifyMonobankSignature(args: {
  config: any;
  body: Buffer;
  signatureBase64: string | undefined;
}) {
  const sig = args.signatureBase64;
  if (!sig) return false;
  const monobank = args.config?.monobank ?? {};
  const keys: string[] = Array.isArray(monobank.webhookPublicKeysPem) ? monobank.webhookPublicKeysPem : [];
  if (keys.length === 0) return false;

  let signature: Buffer;
  try {
    signature = Buffer.from(sig, "base64");
  } catch {
    return false;
  }

  return keys.some((publicKeyPem) => {
    try {
      return crypto.verify("sha256", args.body, publicKeyPem, signature);
    } catch {
      return false;
    }
  });
}

export async function webhooksRoutes(app: FastifyInstance, deps: Deps) {
  app.post<{
    Params: { provider: string; providerId: string };
    Querystring: { t?: string };
  }>("/webhooks/payments/:provider/:providerId", {
    config: {
      rawBody: true,
      rawBodyMaxBytes: 1024 * 1024,
      // Webhook delivery must not be blocked by generic IP-based rate limiting.
      // Provider-specific throttling will be implemented later (per SSOT).
      rateLimit: false,
    },
    bodyLimit: 1024 * 1024,
  }, async (req, reply) => {
    const provider = (req.params.provider ?? "").trim().toLowerCase();
    if (!PAYMENT_WEBHOOK_PROVIDERS.has(provider)) {
      paymentsWebhookRequestsTotal.inc({ provider: "unknown", outcome: "unknown_provider" });
      return reply.code(404).send({ error: "NOT_FOUND" });
    }

    const providerType = providerTypeFromParam(provider);
    if (!providerType) {
      paymentsWebhookRequestsTotal.inc({ provider: "unknown", outcome: "unknown_provider" });
      return reply.code(404).send({ error: "NOT_FOUND" });
    }

    const providerId = (req.params.providerId ?? "").trim();
    const providerRecord = await deps.prisma.paymentProvider.findFirst({
      where: { id: providerId, type: providerType },
      select: { id: true, tenantId: true, type: true, credentialsRef: true, config: true },
    });
    if (!providerRecord) {
      paymentsWebhookRequestsTotal.inc({ provider, outcome: "provider_not_found" });
      return reply.code(404).send({ error: "NOT_FOUND" });
    }

    const token = req.query.t;
    if (!isValidWebhookToken(providerRecord.config, token)) {
      paymentsWebhookRequestsTotal.inc({ provider, outcome: "invalid_token" });
      return reply.code(404).send({ error: "NOT_FOUND" });
    }

    const rawBody = req.rawBody ?? Buffer.alloc(0);

    // Verify signature before parsing/decoding provider payload where signatures exist.
    if (providerType === "MONOBANK") {
      const xSign = (req.headers["x-sign"] as string | undefined) ?? (req.headers["X-Sign" as any] as string | undefined);
      if (!xSign) {
        paymentsWebhookRequestsTotal.inc({ provider, outcome: "invalid_signature" });
        return reply.code(403).send({ error: "INVALID_SIGNATURE" });
      }
      let ok = verifyMonobankSignature({ config: providerRecord.config, body: rawBody, signatureBase64: xSign });
      if (!ok) {
        // Best-effort pubkey refresh (rotation) BEFORE any side effects.
        // Throttle to avoid provider/API abuse on repeated invalid signatures.
        const now = Date.now();
        const nextAllowed = monobankPubkeyRefreshNextAttemptAtMs.get(providerRecord.id) ?? 0;
        if (now >= nextAllowed) {
          monobankPubkeyRefreshNextAttemptAtMs.set(providerRecord.id, now + MONOBANK_PUBKEY_REFRESH_THROTTLE_MS);
          const ref = typeof providerRecord.credentialsRef === "string" ? providerRecord.credentialsRef : undefined;
          const token = ref ? deps.secrets.resolve(ref) : undefined;
          if (token) {
            try {
              const refreshedKey = await monobankFetchPubkeyPem({ token, timeoutMs: 4500, retries: 1, backoffMs: 250 });
              const currentKeys: string[] = Array.isArray(providerRecord.config?.monobank?.webhookPublicKeysPem)
                ? providerRecord.config.monobank.webhookPublicKeysPem
                : [];
              const nextKeys = Array.from(new Set([refreshedKey, ...currentKeys])).slice(0, 2);

              const nextConfig = {
                ...(providerRecord.config ?? {}),
                monobank: {
                  ...((providerRecord.config ?? {}) as any).monobank,
                  webhookPublicKeysPem: nextKeys,
                },
              };

              ok = verifyMonobankSignature({ config: nextConfig, body: rawBody, signatureBase64: xSign });

              // Persist refreshed key for future deliveries (optional; test deps may not include update()).
              if (ok && deps.prisma.paymentProvider.update) {
                await deps.prisma.paymentProvider.update({
                  where: { id: providerRecord.id },
                  data: { config: nextConfig },
                });
              }
            } catch {
              // Ignore refresh errors; fall through to INVALID_SIGNATURE.
            }
          }
        }
      }
      if (!ok) {
        paymentsWebhookRequestsTotal.inc({ provider, outcome: "invalid_signature" });
        return reply.code(403).send({ error: "INVALID_SIGNATURE" });
      }
    }

    let externalId: string | undefined;
    let eventType: string | undefined;
    let providerEventCreatedAt: Date | undefined;

    if (providerType === "MOLLIE") {
      // Mollie classic webhook often posts `id=tr_...` form-encoded.
      const rawText = rawBody.toString("utf8");
      const params = new URLSearchParams(rawText);
      const id = params.get("id") ?? undefined;
      externalId = id;
      eventType = "payment.status_changed";
    } else if (providerType === "MONOBANK") {
      const parsed = safeJsonParse(rawBody) as any;
      externalId = typeof parsed?.invoiceId === "string" ? parsed.invoiceId : undefined;
      eventType = "invoice.status_changed";
      const modifiedDate = typeof parsed?.modifiedDate === "number" ? parsed.modifiedDate : undefined;
      const createdDate = typeof parsed?.createdDate === "number" ? parsed.createdDate : undefined;
      const ts = modifiedDate ?? createdDate;
      if (typeof ts === "number") providerEventCreatedAt = new Date(ts * 1000);
    } else if (providerType === "LIQPAY") {
      // LiqPay callbacks are commonly form-encoded: `data=...&signature=...` (but some setups may send JSON).
      const rawText = rawBody.toString("utf8");
      const params = new URLSearchParams(rawText);
      let data = params.get("data") ?? undefined;
      let signature = params.get("signature") ?? undefined;

      if (!data || !signature) {
        const outer = safeJsonParse(rawBody) as any;
        data = typeof outer?.data === "string" ? outer.data : undefined;
        signature = typeof outer?.signature === "string" ? outer.signature : undefined;
      }
      if (!data || !signature) {
        paymentsWebhookRequestsTotal.inc({ provider, outcome: "invalid_signature" });
        return reply.code(401).send({ error: "INVALID_SIGNATURE" });
      }

      const ok = isValidLiqpaySignature({ config: providerRecord.config, secrets: deps.secrets, data, signature });
      if (!ok) {
        paymentsWebhookRequestsTotal.inc({ provider, outcome: "invalid_signature" });
        return reply.code(401).send({ error: "INVALID_SIGNATURE" });
      }

      // Signature verified: now it is safe to decode + parse `data`.
      let decoded: any;
      try {
        decoded = JSON.parse(Buffer.from(data, "base64").toString("utf8"));
      } catch {
        decoded = undefined;
      }
      externalId = typeof decoded?.order_id === "string" ? decoded.order_id : undefined;
      eventType = "payment.status_changed";
    }

    if (!externalId) {
      // Per SSOT: if we cannot extract externalId, return 2xx to prevent provider retry storms.
      paymentsWebhookRequestsTotal.inc({ provider, outcome: "no_external_id" });
      return reply.code(200).send({ ok: true });
    }

    const payloadHash = sha256Hex(rawBody);
    const dedupKey = computeDedupKey({ externalId, eventType, providerEventCreatedAt, payloadHash });

    let paymentEventId: string | null = null;
    try {
      const created = await deps.prisma.paymentEvent.create({
        data: {
          tenantId: providerRecord.tenantId,
          providerId: providerRecord.id,
          externalId,
          eventType,
          providerEventCreatedAt,
          payloadHash,
          dedupKey,
          status: "RECEIVED",
        },
      });
      paymentEventId = typeof created?.id === "string" ? created.id : null;
      paymentsWebhookRequestsTotal.inc({ provider, outcome: "inserted" });
    } catch (err: any) {
      if (!isUniqueViolation(err)) throw err;
      // Dedup hit: still return 2xx quickly.
      // Per SSOT: schedule `resync.external` so we still converge even if the original event job was lost.
      paymentsWebhookRequestsTotal.inc({ provider, outcome: "dedup_hit" });
      if (deps.paymentsQueue) {
        deps.paymentsQueue.enqueueResyncExternal({
          tenantId: providerRecord.tenantId,
          providerId: providerRecord.id,
          externalId,
        }).catch(() => {});
      }
    }

    // Best-effort enqueue; if queue is down/misconfigured, rely on sweepers/manual resync later.
    if (deps.paymentsQueue && paymentEventId) {
      deps.paymentsQueue.enqueueWebhookProcess({ paymentEventId }).catch(() => {});
    }

    return reply.code(200).send({ ok: true });
  });
}
