import crypto from "node:crypto";
import type { PrismaClient } from "@vendora/database";

export const PAYMENT_CHECKOUT_SCOPE = "payment_checkout" as const;

export type PaymentCheckoutRequestBodyForHash = {
  orderToken: string;
  providerId?: string | null | undefined;
};

export type PaymentCheckoutIdempotencyResolution =
  | { kind: "MISS" }
  | { kind: "HIT"; transactionId: string }
  | { kind: "CONFLICT" };

function isUniqueViolation(err: unknown) {
  // Prisma P2002: Unique constraint failed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (err as any)?.code === "P2002";
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && (value as object).constructor === Object;
}

function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (!isPlainObject(value)) return value;

  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = sortKeysDeep(value[key]);
  }
  return out;
}

export function canonicalJson(value: unknown) {
  return JSON.stringify(sortKeysDeep(value));
}

function sha256Hex(input: Buffer | string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function computePaymentCheckoutRequestHash(body: PaymentCheckoutRequestBodyForHash) {
  const canonicalInput = {
    orderToken: body.orderToken,
    providerId: body.providerId ?? null,
  };
  return sha256Hex(canonicalJson(canonicalInput));
}

export async function resolvePaymentCheckoutIdempotency(args: {
  prisma: PrismaClient;
  tenantId: string;
  idempotencyKey: string;
  requestHash: string;
}): Promise<PaymentCheckoutIdempotencyResolution> {
  const existing = await args.prisma.paymentCheckoutRequest.findUnique({
    where: {
      tenantId_scope_idempotencyKey: {
        tenantId: args.tenantId,
        scope: PAYMENT_CHECKOUT_SCOPE,
        idempotencyKey: args.idempotencyKey,
      },
    },
    select: { requestHash: true, transactionId: true },
  });

  if (!existing) return { kind: "MISS" };
  if (existing.requestHash !== args.requestHash) return { kind: "CONFLICT" };
  return { kind: "HIT", transactionId: existing.transactionId };
}

export async function bindPaymentCheckoutRequest(args: {
  prisma: PrismaClient;
  tenantId: string;
  idempotencyKey: string;
  requestHash: string;
  orderDbId: string;
  providerId: string | null;
  transactionId: string;
}): Promise<
  | { ok: true; created: boolean; transactionId: string }
  | { ok: false; code: "IDEMPOTENCY_CONFLICT"; existingTransactionId: string }
> {
  try {
    await args.prisma.paymentCheckoutRequest.create({
      data: {
        tenantId: args.tenantId,
        scope: PAYMENT_CHECKOUT_SCOPE,
        idempotencyKey: args.idempotencyKey,
        requestHash: args.requestHash,
        orderDbId: args.orderDbId,
        providerId: args.providerId,
        transactionId: args.transactionId,
      },
      select: { id: true },
    });
    return { ok: true, created: true, transactionId: args.transactionId };
  } catch (err) {
    if (!isUniqueViolation(err)) throw err;

    const res = await resolvePaymentCheckoutIdempotency({
      prisma: args.prisma,
      tenantId: args.tenantId,
      idempotencyKey: args.idempotencyKey,
      requestHash: args.requestHash,
    });

    if (res.kind === "HIT") return { ok: true, created: false, transactionId: res.transactionId };

    // If conflict, bubble a structured response for HTTP 409.
    // MISS after unique violation is unexpected, but treating it as conflict is safer than proceeding.
    const existing = await args.prisma.paymentCheckoutRequest.findUnique({
      where: {
        tenantId_scope_idempotencyKey: {
          tenantId: args.tenantId,
          scope: PAYMENT_CHECKOUT_SCOPE,
          idempotencyKey: args.idempotencyKey,
        },
      },
      select: { transactionId: true },
    });

    return {
      ok: false,
      code: "IDEMPOTENCY_CONFLICT",
      existingTransactionId: existing?.transactionId ?? args.transactionId,
    };
  }
}

