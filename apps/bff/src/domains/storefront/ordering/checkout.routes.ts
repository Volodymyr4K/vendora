import type { FastifyInstance, FastifyBaseLogger } from "fastify";
import { trace, SpanStatusCode } from '@opentelemetry/api';
import type { Cache } from "../../../cache/index.js";
import { getOrSet } from "../../../cache/stale.js";
import type { Upstream } from "../../../services/upstream.js";
import type { Metrics } from "../../../observability/metrics.js";
import crypto from "node:crypto";
import {
  zQuoteRequest,
  zQuoteResponse,
  zDeliveryResponse,
  zCheckoutInitRequest,
  zCheckoutInitResponse,
  zCheckoutConfirmRequest,
  zCheckoutConfirmResponse,
  type QuoteRequest,
  type CheckoutInitRequest,
  type CheckoutConfirmRequest,
} from "@vendora/contracts";
import { validateDeliveryTime, validateASAP, validateSlotCapacity } from "./validation.js";
import { prisma } from "@vendora/database";
import { moneyFromMinor, moneyToMinor } from "../../../utils/money.js";
import { getPriceForBranch } from "../../../services/offer-price.js";
import type { AppConfig } from "../../../config.js";
import type { PaymentService } from "../../../services/payment.js";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import {
    SCHEDULED_ORDERING_DISABLED_BODY,
    TENANT_MISMATCH_BODY,
    zCheckout403Response,
    zFeatureDisabledResponse
} from "../../../schemas/storefront-errors.js";
import { stageEvent } from "../../../services/outbox/stager.js";

// Helper for type-safe request ID access
// Removed as global FastifyRequest now includes id

function base64url(buf: Buffer) {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function newToken() {
  return base64url(crypto.randomBytes(18));
}

function nowIso() {
  return new Date().toISOString();
}

type Deps = {
  cache: Cache;
  upstream: Upstream;
  paymentService: PaymentService;
  prisma: typeof prisma;
  ttlSec: number;
  staleSec: number;
  swr: boolean;
  metrics?: Metrics;
  idemTtlSec: number;
  orderTtlSec: number;
  orderUpstream: boolean;
  quoteCache: { ttlSec: number; staleSec: number };
  config: AppConfig;
  eventBus?: import("../../../services/event-bus/bus.js").EventBus;
};

export async function routesCheckout(app: FastifyInstance, deps: Deps) {
  const tracer = trace.getTracer('vendora-bff');

  // --- HELPER: Compute Quote ---
  async function computeQuote(
    branchSlug: string,
    items: Array<{ id: string; qty: number }>,
    requestId: string | undefined,
    tenantId: string | undefined,
    tenantSlug: string | undefined,
    _log: FastifyBaseLogger
  ) {
    if (!tenantId || !tenantSlug) throw new Error("Tenant context required");

    const cartIds = items.map(x => x.id);

    const branch = await deps.prisma.branch.findFirst({
      where: { slug: branchSlug, tenantId }, // Strict tenant match
      select: { id: true, tenantId: true }
    });
    if (!branch) throw new Error("Branch not found");

    // Phase 2.1: Only items with default variant; Phase 4.2: price/availability from Offer only
    const dbItems = await deps.prisma.catalogItem.findMany({
      where: {
        id: { in: cartIds },
        tenantId: branch.tenantId,
        status: "ACTIVE",
        variants: { some: { isDefault: true } }
      },
      select: { id: true, title: true, variants: { where: { isDefault: true }, select: { id: true } } }
    });

    if (dbItems.length !== cartIds.length) {
      const foundIds = new Set(dbItems.map(p => p.id));
      const missing = cartIds.filter(id => !foundIds.has(id));
      throw new Error(`Items unavailable: ${missing.join(', ')}`);
    }

    const delKey = `tenant:${tenantId}:delivery:${branchSlug}`;
    const delR = await getOrSet(
      deps.cache,
      delKey,
      deps.ttlSec,
      deps.staleSec,
      () => deps.upstream.getDelivery(branchSlug, { requestId, tenantId, tenantSlug }),
      { swr: deps.swr }
    );
    const deliveryParsed = zDeliveryResponse.safeParse(delR.data);
    const delivery = deliveryParsed.success ? deliveryParsed.data : { mode: "fallback" as const, message: "Please confirm delivery terms." };

    const dbMap = new Map(dbItems.map(p => [p.id, p]));
    const lines: Array<{ id: string; name: string; qty: number; unitPrice: number; lineTotal: number }> = [];
    let subtotalCents = 0;

    for (const it of items) {
      const item = dbMap.get(it.id)!;
      const defaultVariant = item.variants[0];
      if (!defaultVariant) throw new Error(`Items unavailable: ${item.id}`);
      const offerPrice = await getPriceForBranch(deps.prisma, branch.tenantId, branch.id, defaultVariant.id);
      if (!offerPrice.isAvailable) throw new Error(`Items unavailable: ${item.id}`);
      const qty = Number(it.qty || 0);
      const priceCents = offerPrice.priceCents;
      const priceUAH = moneyFromMinor(priceCents);
      const lineTotalCents = priceCents * qty;
      subtotalCents += lineTotalCents;

      lines.push({
        id: item.id,
        name: item.title,
        qty,
        unitPrice: priceUAH,
        lineTotal: moneyFromMinor(lineTotalCents)
      });
    }

    let deliveryFeeCents = 0;
    let freeFrom: number | undefined;
    let etaMin: number | undefined;
    let etaMax: number | undefined;
    let mode: "ok" | "fallback" = "ok";
    let message: string | undefined;

    if (delivery.mode === "ok") {
      deliveryFeeCents = moneyToMinor(delivery.cfg.deliveryFee);
      freeFrom = delivery.cfg.freeFrom;
      etaMin = delivery.cfg.etaMin;
      etaMax = delivery.cfg.etaMax;

      const freeFromCents = typeof freeFrom === "number" ? moneyToMinor(freeFrom) : undefined;
      if (freeFromCents !== undefined && subtotalCents >= freeFromCents) {
        deliveryFeeCents = 0;
      }
    } else {
      mode = "fallback";
      message = delivery.message || "Please confirm delivery terms.";
    }

    const totalCents = subtotalCents + deliveryFeeCents;

    return zQuoteResponse.parse({
      mode,
      message,
      currency: "UAH",
      branchSlug,
      lines,
      subtotal: moneyFromMinor(subtotalCents),
      deliveryFee: moneyFromMinor(deliveryFeeCents),
      freeFrom,
      total: moneyFromMinor(totalCents),
      etaMin,
      etaMax,
    });
  }

  // --- 1. CART QUOTE (Used by Cart Page) ---
  app.post<{ Body: QuoteRequest }>("/cart/quote", {
    schema: {
      body: zQuoteRequest,
      response: { 200: zQuoteResponse, 403: zFeatureDisabledResponse }
    },
    config: {
      rateLimit: { max: deps.config.RATE_LIMIT_QUOTE, timeWindow: '1 minute' }
    }
  }, async (req, reply) => {
    const tenant = validateTenant(req);
    if (!requireStorefrontFeature(req, reply, "cartCheckout", "ordering")) return;
    // No manual validation needed - Fastify validates via schema

    try {
      const out = await computeQuote(
        req.body.branchSlug,
        req.body.items,
        // Fastify runtime-decorated request ID
        req.id,
        tenant.id,
        tenant.slug,
        req.log
      );
      return reply.header("cache-control", "no-store").send(out);
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      return reply.code(409).send({ error: "QUOTE_FAILED", message: err.message });
    }
  });

  // --- 2. CHECKOUT INIT (Draft) ---
  app.post<{ Body: CheckoutInitRequest }>("/checkout/init", {
    schema: {
      body: zCheckoutInitRequest,
      response: {
        200: zCheckoutInitResponse,
        403: zCheckout403Response
      }
    },
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' } // Strict limit for OTP gen
    }
  }, async (req, reply) => {
    const tenant = validateTenant(req);
    if (!requireStorefrontFeature(req, reply, "cartCheckout", "ordering")) return;
    // No manual validation needed - Fastify validates via schema

    const { phone } = req.body.customer;

    // 1. Calculate Quote (Validate Items)
    let quote;
    try {
      quote = await computeQuote(
        req.body.branchSlug,
        req.body.items,
        // Fastify runtime-decorated request ID
        req.id,
        tenant.id,
        tenant.slug,
        req.log
      );
    } catch (error: unknown) {
      const err = error instanceof Error ? error : new Error(String(error));
      return reply.code(409).send({ error: "CART_INVALID", message: err.message });
    }

    // 2. Validate Time & Branch
    // Fetch branch with timezone AND tenant for inheritance
    const branch = await deps.prisma.branch.findFirst({
      where: { slug: req.body.branchSlug, tenantId: tenant.id },
      select: {
        slug: true,         // NEW: Required for validation
        tenantId: true,     // NEW: Required for validation
        isScheduledOrderingEnabled: true,
        minAdvanceMinutes: true,
        slotCapacity: true,
        timezone: true,
        workingSchedule: true, // NEW: Fetch working schedule
        tenant: {
          select: { timezone: true }
        }
      }
    });

    if (!branch) return reply.code(404).send({ error: "Branch not found" });

    if (req.body.requestedDeliveryTime) {
      // Step 7 (AUDIT_6): tenant entitlement — tenant off → 403 FEATURE_DISABLED
      if (!requireStorefrontFeature(req, reply, "scheduledOrdering", "ordering")) return;
      // Branch toggle — branch off → 403 SCHEDULED_ORDERING_DISABLED (distinct from FEATURE_DISABLED)
      if (!branch.isScheduledOrderingEnabled) {
        return reply.code(403).send(SCHEDULED_ORDERING_DISABLED_BODY);
      }

      // Validation 1-3: Timezone Aware Checks
      const valRes = validateDeliveryTime(req.body.requestedDeliveryTime, branch);
      if (!valRes.valid) {
        return reply.code(400).send({
          error: valRes.error,
          message: valRes.message
        });
      }

      // Validation 4: Kitchen Capacity (Slot Load)
      const slotRes = await validateSlotCapacity(branch, req.body.requestedDeliveryTime, deps.prisma);
      if (!slotRes.valid) {
        return reply.code(400).send({
          error: slotRes.error,
          message: slotRes.message
        });
      }
    } else {
      // ASAP Order: MUST validate if store is open NOW
      const valRes = validateASAP(branch);
      if (!valRes.valid) {
        return reply.code(400).send({
          error: valRes.error,
          message: valRes.message
        });
      }
    }

    // 3. Create Draft Object
    const draft = {
      ...req.body,
      quote,
      tenantId: tenant.id,
      createdAt: Date.now()
    };

    // 3. Save to Redis (TTL 300s)
    const draftKey = `checkout:draft:${tenant.id}:${phone}`;
    await deps.cache.set(draftKey, draft, 300, 300);

    // 4. Send OTP (Mock)
    req.log.info({ phone, code: "0000" }, "Checkout OTP Generated");
    // In real env, call SMS provider here.

    return { success: true, ttl: 300 };
  });

  // --- 3. CHECKOUT CONFIRM (Commit) ---
  app.post<{ Body: CheckoutConfirmRequest }>("/checkout/confirm", {
    schema: {
      body: zCheckoutConfirmRequest,
      response: {
        200: zCheckoutConfirmResponse,
        403: zCheckout403Response
      }
    },
    config: {
      rateLimit: { max: 5, timeWindow: '1 minute' }
    }
  }, async (req, reply) => {
    return tracer.startActiveSpan('checkout.process', async (span) => {
      try {
        const startTime = Date.now(); // Phase 3: Metrics tracking
        const tenant = validateTenant(req);
        if (!requireStorefrontFeature(req, reply, "cartCheckout", "ordering")) return;

        // IDEMPOTENCY CHECK (Phase 1F)
        const idempotencyKey = req.headers['idempotency-key'] as string;
        if (!idempotencyKey) {
          return reply.code(400).send({ error: "Missing 'idempotency-key' header" });
        }
        const idempotencyScope = 'order_create';

        // Add context to span
        span.setAttributes({
          'tenant.id': tenant.id,
          'http.method': 'POST',
          'http.route': '/checkout/confirm',
          'idempotency.key': idempotencyKey
        });

        // No manual validation needed - Fastify validates via schema
        const { phone, otp } = req.body;

        // 1. Verify OTP
        if (otp !== "0000") {
          span.setAttribute('error', true);
          span.setAttribute('error.type', 'Invalid OTP');
          return reply.code(400).send({ error: "Invalid OTP" });
        }

        // 2. Retrieve Draft
        const draftKey = `checkout:draft:${tenant.id}:${phone}`;
        // Retrieving complex draft object from cache
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draftWrap = await deps.cache.get<any>(draftKey);

        if (!draftWrap || !draftWrap.value) {
          return reply.code(404).send({ error: "SESSION_EXPIRED", message: "Checkout session expired. Please retry." });
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const draft = draftWrap.value as CheckoutInitRequest & { quote: any, tenantId: string };

        // Tenant safety check
        if (draft.tenantId !== tenant.id) {
          return reply.code(403).send(TENANT_MISMATCH_BODY);
        }

        // Validate quote once so moneyToMinor never gets non-number (avoid 500 without context)
        const quoteParsed = zQuoteResponse.safeParse(draft.quote);
        if (!quoteParsed.success) {
          return reply.code(409).send({
            error: "INVALID_QUOTE",
            message: "Invalid session or quote. Please restart checkout."
          });
        }
        const quote = quoteParsed.data;

        // Capture business attributes
        span.setAttributes({
          'branch.slug': draft.branchSlug,
          'order.total_cents': moneyToMinor(quote.total),
          'delivery.method': draft.delivery.method
        });

        // 2.5. Re-validate requestedDeliveryTime (Safety Check)
        let fireAt: Date = new Date(); // Default: Start cooking immediately (ASAP)

        const branch = await deps.prisma.branch.findFirst({
          where: { slug: draft.branchSlug, tenantId: tenant.id },
          select: {
            id: true,           // Phase 4.2: for Offer validation at order create
            slug: true,
            tenantId: true,
            isScheduledOrderingEnabled: true,
            minAdvanceMinutes: true,
            prepTimeMinutes: true,
            slotCapacity: true, // NEW
            timezone: true,
            workingSchedule: true, // NEW: Fetch working schedule
            tenant: { select: { timezone: true } }
          }
        });

        if (!branch) return reply.code(404).send({ error: "Branch not found" });

        if (draft.requestedDeliveryTime) {
          // Step 7 (AUDIT_6): tenant entitlement — tenant off → 403 FEATURE_DISABLED
          if (!requireStorefrontFeature(req, reply, "scheduledOrdering", "ordering")) return;
          // Branch toggle — branch off → 403 SCHEDULED_ORDERING_DISABLED
          if (!branch.isScheduledOrderingEnabled) {
            return reply.code(403).send(SCHEDULED_ORDERING_DISABLED_BODY);
          }

          const valRes = validateDeliveryTime(draft.requestedDeliveryTime, branch);
          if (!valRes.valid) {
            return reply.code(400).send({
              error: valRes.error,
              message: valRes.message
            });
          }

          // Validation 4: Kitchen Capacity (Double Check)
          const slotRes = await validateSlotCapacity(branch, draft.requestedDeliveryTime, deps.prisma);
          if (!slotRes.valid) {
            return reply.code(400).send({
              error: slotRes.error,
              message: slotRes.message
            });
          }

          // Calculate Fire At (When Kitchen should start)
          const { getEffectiveTimezone } = await import('../../../utils/timezone-helpers.js');
          const { DateTime } = await import('luxon');

          const timezone = getEffectiveTimezone(branch.timezone, branch.tenant.timezone);
          const reqDt = DateTime.fromISO(draft.requestedDeliveryTime, { zone: timezone });
          fireAt = reqDt.minus({ minutes: branch.prepTimeMinutes || 30 }).toJSDate();
        } else {
          // ASAP Safety Check
          const valRes = validateASAP(branch);
          if (!valRes.valid) {
            return reply.code(400).send({
              error: valRes.error,
              message: valRes.message
            });
          }
        }

        // 3. ATOMIC TRANSACTION
        try {
          const result = await deps.prisma.$transaction(async (tx) => {
            // Tenant currency for Order (Phase 3.1: single source of truth)
            const tenantRow = await tx.tenant.findUnique({
              where: { id: tenant.id },
              select: { currency: true }
            });
            const orderCurrency = tenantRow?.currency ?? "UAH";

            // A. Auto-Onboarding (Upsert Customer)
            const customer = await tx.customer.upsert({
              where: { phone_tenantId: { phone, tenantId: tenant.id } },
              create: {
                phone,
                tenantId: tenant.id,
                name: draft.customer.name || undefined,
                isVerified: true
              },
              update: {
                // Update name only if not set? Or overwrite? 
                // Better to only update name if currently empty, or update name if provided.
                // Let's update name if draft provides it.
                ...(draft.customer.name ? { name: draft.customer.name } : {}),
                isVerified: true
              }
            });

            // B. Address Logic
            let finalAddressString = ""; // Legacy string column in Order
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            let finalAddressSnapshot: any = {}; // Structured snapshot for payload

            if (draft.delivery.method === "delivery") {
              if (draft.delivery.addressId) {
                // Variant A: Existing Address
                const addr = await tx.customerAddress.findFirst({
                  where: { tenantId: customer.tenantId, customerId: customer.id, id: draft.delivery.addressId }
                });
                if (!addr) throw new Error("ADDRESS_NOT_FOUND");

                finalAddressString = `${addr.city}, ${addr.street} ${addr.house}`;
                finalAddressSnapshot = addr; // Snapshot the DB record
              } else if (draft.delivery.newAddress) {
                // Variant B: New Address
                const na = draft.delivery.newAddress;
                finalAddressString = `${na.city}, ${na.street} ${na.house}`;
                finalAddressSnapshot = na;

                // Should we save it?
                if (draft.saveToAddressBook) {
                  const count = await tx.customerAddress.count({ where: { tenantId: customer.tenantId, customerId: customer.id } });
                  if (count < 5) {
                    await tx.customerAddress.create({
                      data: {
                        tenantId: customer.tenantId,
                        customerId: customer.id,
                        city: na.city,
                        street: na.street,
                        house: na.house,
                        flat: na.flat,
                        label: na.label || "Home", // Default label
                      }
                    });
                  }
                  // If >= 5, silent skip (User Requirement)
                }
              } else {
                throw new Error("ADDRESS_REQUIRED_FOR_DELIVERY");
              }
            } else {
              // Pickup
              finalAddressString = "Pickup";
            }

            // C. Create Order
            const orderId = `ORD-${nowIso().slice(0, 10).replace(/-/g, "")}-${crypto.randomBytes(3).toString("hex")}`;
            const token = newToken();

            // Final payload construction
            const payload = {
              customer: { id: customer.id, name: customer.name, phone: customer.phone },
              delivery: {
                method: draft.delivery.method,
                address: finalAddressString,
                snapshot: finalAddressSnapshot,
                comment: draft.comment,
                requestedDeliveryTime: draft.requestedDeliveryTime
              },
              items: draft.items,
              quote: draft.quote,
              payment: draft.payment
            };

            const createdOrder = await tx.order.create({
              data: {
                token,
                orderId,
                branchSlug: draft.branchSlug,
                branchId: branch.id, // Phase 4.3: canonical location (NOT NULL)
                status: "created",
                total: moneyToMinor(quote.total),
                currency: orderCurrency,
                tenantId: tenant.id,
                customerId: customer.id,
                personCount: draft.personCount,
                comment: draft.comment,
                requestedDeliveryTime: draft.requestedDeliveryTime ? new Date(draft.requestedDeliveryTime) : null,
                fireAt, // Calculated Kitchen Start Time
                // Prisma JsonValue - validated at runtime via Zod schemas
                payload: payload as import("@vendora/database").Prisma.InputJsonValue,

                // IDEMPOTENCY
                idempotencyKey,
                idempotencyScope
              }
            });

            // Phase 3.1: Create OrderLines from quote (snapshot: priceCents, itemTitle, sku, currency from Order)
            // Phase 4.2: Offer must exist for (branchId, variantId) — 4xx if not
            const quoteLines = quote.lines;
            if (quoteLines.length > 0) {
              const catalogItemIds = [...new Set(quoteLines.map((l) => l.id))];
              const defaultVariants = await tx.itemVariant.findMany({
                where: {
                  catalogItemId: { in: catalogItemIds },
                  tenantId: tenant.id,
                  isDefault: true
                },
                select: { id: true, catalogItemId: true, sku: true }
              });
              const variantByItemId = new Map(defaultVariants.map(v => [v.catalogItemId, v]));
              for (const line of quoteLines) {
                const variant = variantByItemId.get(line.id);
                if (!variant) throw new Error("ITEM_UNAVAILABLE");
                const offer = await tx.offer.findUnique({
                  where: {
                    tenantId_branchId_variantId: {
                      tenantId: tenant.id,
                      branchId: branch.id,
                      variantId: variant.id
                    }
                  }
                });
                if (!offer || !offer.isAvailable) throw new Error("OFFER_NOT_FOUND");
                const priceCents = moneyToMinor(line.unitPrice);
                await tx.orderLine.create({
                  data: {
                    tenantId: tenant.id,
                    orderId: createdOrder.id,
                    offerId: offer.id, // Phase 4.4: canonical reference (NOT NULL)
                    variantId: variant.id, // snapshot/audit only; do not read in business logic
                    qty: Number(line.qty) || 1,
                    priceCents,
                    currency: orderCurrency,
                    itemTitle: String(line.name ?? ""),
                    sku: variant.sku
                  }
                });
              }
            }

            // Phase 3.2: Create OrderAdjustments from quote (delivery_fee, etc.; amountCents in Order.currency)
            {
              const deliveryFeeCents = moneyToMinor(quote.deliveryFee ?? 0);
              if (deliveryFeeCents > 0) {
                await tx.orderAdjustment.create({
                  data: {
                    tenantId: tenant.id,
                    orderId: createdOrder.id,
                    type: "delivery_fee",
                    amountCents: deliveryFeeCents,
                    label: "Delivery"
                  }
                });
              }
            }

            // Phase 3.4: OrderLineOption — filled from payload when line-level options exist (draft.items have no options yet; table ready)
            // When payload has options per line, iterate created OrderLines and create OrderLineOption with optionItemId, qty, priceDeltaCents, optionItemTitleSnapshot

            // Phase 3.3: Create Fulfillment from payload (type, address, requestedTime)
            await tx.fulfillment.create({
              data: {
                tenantId: tenant.id,
                orderId: createdOrder.id,
                type: draft.delivery.method,
                address: draft.delivery.method === "pickup" ? null : finalAddressString,
                requestedTime: draft.requestedDeliveryTime ? new Date(draft.requestedDeliveryTime) : null,
                status: "pending"
              }
            });

            // Cleanup draft? No, let TTL expire logic handle it or simple cache delete.

            // D. Atomic Update of Customer State (tenant-scoped write)
            // Non-critical: if update fails, log and continue — checkout must complete.
            const customerUpdateRes = await tx.customer.updateMany({
              where: { id: customer.id, tenantId: tenant.id },
              data: { lastVisitedBranchSlug: draft.branchSlug }
            });
            if (customerUpdateRes.count !== 1) {
              req.log.warn(
                { requestId: req.id, count: customerUpdateRes.count },
                "Last-visited branch not saved; checkout continues"
              );
            }

            // 5. EVENT OUTBOX (Transactional Staging)
            // Replaces fire-and-forget eventBus.publish
            await stageEvent(tx, "order.created", {
              orderId: orderId, // Use the generated orderId
              tenantId: tenant.id,
              branchSlug: draft.branchSlug,
              total: moneyFromMinor(moneyToMinor(quote.total)),
              currency: "UAH",
              userId: customer.id
            });

            return { order: createdOrder, customer, token };
          });

          // 4. Issue Token & Cookie
          const token = await reply.jwtSign({
            role: "customer",
            userId: result.customer.id,
            customerId: result.customer.id,
            tenantId: tenant.id,
            phone: result.customer.phone
            // Fastify JWT payload typing limitation
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
          } as any);

          reply.setCookie("customer_token", token, {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 3600 // 30 days
          });

          // Phase 3: Business Metrics - SUCCESS
          const duration = (Date.now() - startTime) / 1000;
          const paymentMethod = deps.metrics?.normalizePaymentMethod(draft.payment?.method) || 'cash';

          deps.metrics?.checkoutDuration.observe({
            tenant_id: tenant.id,
            payment_method: paymentMethod,
            status: 'success'
          }, duration);

          deps.metrics?.checkoutTotal.inc({
            tenant_id: tenant.id,
            payment_method: paymentMethod,
            status: 'success'
          }, duration);

          // 5. EVENT BUS (Removed - Handled by Outbox Relay)
          // if (deps.eventBus) ...

          span.setStatus({ code: SpanStatusCode.OK });
          return {
            success: true,
            orderId: result.order.orderId,
            token: result.order.token,
            user: {
              name: result.customer.name,
              email: result.customer.email,
              phone: result.customer.phone
            }
          };

        } catch (error: unknown) {
          const err = error instanceof Error ? error : new Error(String(error));

          // IDEMPOTENCY RECOVERY (Unique Constraint Violation)
          // P2002: Unique constraint failed on the {constraint}
          // @ts-ignore - Prisma error code access
          if (err.code === "P2002") {
            req.log.warn({ idempotencyKey }, "Idempotency Hit: Returning existing order");

            // Fetch the existing order
            const existing = await deps.prisma.order.findUnique({
              where: {
                tenantId_idempotencyScope_idempotencyKey: {
                  tenantId: tenant.id,
                  idempotencyScope,
                  idempotencyKey
                }
              },
              include: { customer: true }
            });

            if (existing && existing.customer) {
              // Re-issue token (safe operation) or reuse? Re-issuing is fine.
              // We need to return exactly the same shape.

              const token = await reply.jwtSign({
                role: "customer",
                userId: existing.customerId!,
                customerId: existing.customerId!,
                tenantId: tenant.id,
                phone: existing.customer.phone
              } as { role: string; userId: string; tenantId: string; phone: string });

              reply.setCookie("customer_token", token, {
                path: "/",
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "strict",
                maxAge: 30 * 24 * 3600
              });

              return {
                success: true,
                orderId: existing.orderId,
                token: existing.token,
                user: {
                  name: existing.customer.name,
                  email: existing.customer.email,
                  phone: existing.customer.phone
                }
              };
            }
          }

          span.recordException(err);
          span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });

          // Phase 3: Business Metrics - FAILURE
          const duration = (Date.now() - startTime) / 1000;
          const paymentMethod = 'cash'; // Default for failed checkouts

          deps.metrics?.checkoutDuration.observe({
            tenant_id: tenant.id,
            payment_method: paymentMethod,
            status: 'failed'
          }, duration);

          deps.metrics?.checkoutTotal.inc({
            tenant_id: tenant.id,
            payment_method: paymentMethod,
            status: 'failed'
          });

          if (err.message === "ADDRESS_NOT_FOUND") return reply.code(400).send({ error: "Selected address not found" });
          if (err.message === "ADDRESS_REQUIRED_FOR_DELIVERY") return reply.code(400).send({ error: "Address required for delivery" });
          if (err.message === "OFFER_NOT_FOUND") return reply.code(409).send({ error: "OFFER_NOT_FOUND", message: "Item not available for this branch" });

          app.log.error({ err }, "Checkout Confirm Failed");
          return reply.code(500).send({ error: "INTERNAL_ERROR", message: "Order creation failed" });
        }
      } finally {
        span.end();
      }
    }); // End of span wrapper
  });
}
