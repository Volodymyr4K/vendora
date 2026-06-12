/**
 * Integration tests for AUDIT_6 feature flags (6.11 acceptance).
 * Verifies: features === null → 503; features === undefined → 500; scheduled ordering tenant off → 403.
 *
 * IMPORTANT: Headers x-test-features and x-test-branch-scheduled exist ONLY in this test app.
 * They are not registered in production BFF and must not be used in production code (no debug backdoor).
 */

import { describe, it, expect, beforeEach } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import { requireStorefrontFeature } from "../../lib/feature-guard.js";
import { SCHEDULED_ORDERING_DISABLED_BODY } from "../../schemas/storefront-errors.js";
import type { TenantFeatures } from "@vendora/contracts";
import { DEFAULT_TENANT_FEATURES } from "@vendora/contracts";
import { DEFAULT_RESOLVED_THEME } from "../../services/theme.js";

const TENANT_ID = "11111111-1111-1111-1111-111111111111";
const TENANT_SLUG = "test-tenant";

function buildTenant(features: TenantFeatures | null | undefined) {
    return {
        id: TENANT_ID,
        name: "Test",
        slug: TENANT_SLUG,
        isActive: true,
        customDomainsEnabled: false,
        countryCode: "UA",
        currency: "UAH",
        features,
        theme: DEFAULT_RESOLVED_THEME,
    };
}

describe("AUDIT_6 integration: feature flags invariants", () => {
    let app: FastifyInstance;

    beforeEach(async () => {
        app = Fastify({ logger: false });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.decorateRequest("tenant", undefined as any);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        app.decorateRequest("tenantId", undefined as any);

        // Simulate tenant-context: inject req.tenant (as in real flow after resolveTenant)
        app.addHook("onRequest", async (req, _reply) => {
            const variant = (req.headers["x-test-features"] as string) || "ok";
            if (variant === "null") {
                req.tenant = buildTenant(null) as typeof req.tenant;
            } else if (variant === "undefined") {
                const t = buildTenant(undefined);
                delete (t as { features?: unknown }).features;
                req.tenant = t as typeof req.tenant;
            } else if (variant === "scheduled-off") {
                req.tenant = buildTenant({
                    ...DEFAULT_TENANT_FEATURES,
                    modules: { ...DEFAULT_TENANT_FEATURES.modules, scheduledOrdering: false }
                }) as typeof req.tenant;
            } else {
                req.tenant = buildTenant(DEFAULT_TENANT_FEATURES) as typeof req.tenant;
            }
            req.tenantId = TENANT_ID;
        });

        // Stub storefront route: enforce 503 for null, 500 for undefined (same contract as tenant-context)
        app.get("/storefront/ping", async (req, reply) => {
            const features = req.tenant?.features;
            if (features === null) {
                return reply.code(503).send({ error: "Tenant not configured", code: "TENANT_NOT_CONFIGURED" });
            }
            if (features === undefined) {
                return reply.code(500).send({
                    error: "Server configuration error: tenant features not available",
                    code: "INTERNAL_MISCONFIG"
                });
            }
            return reply.send({ ok: true });
        });

        // Stub route that uses feature guard (scheduled ordering)
        app.get("/storefront/time-slots", async (req, reply) => {
            if (!requireStorefrontFeature(req, reply, "scheduledOrdering", "ordering")) return;
            return reply.send({ slots: [], isScheduledOrderingEnabled: true });
        });

        // Stub route: tenant scheduledOrdering guard + branch off → 403 SCHEDULED_ORDERING_DISABLED when requestedDeliveryTime present
        app.post("/storefront/checkout-stub", async (req, reply) => {
            if (!requireStorefrontFeature(req, reply, "scheduledOrdering", "ordering")) return;
            const body = req.body as { requestedDeliveryTime?: string };
            const branchScheduled = (req.headers["x-test-branch-scheduled"] as string) !== "false";
            if (body?.requestedDeliveryTime && !branchScheduled) {
                return reply.code(403).send(SCHEDULED_ORDERING_DISABLED_BODY);
            }
            return reply.send({ ok: true });
        });

        await app.ready();
    });

    it("features === null → 503 TENANT_NOT_CONFIGURED on storefront endpoint", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/storefront/ping",
            headers: { "x-test-features": "null" }
        });
        expect(res.statusCode).toBe(503);
        const body = res.json();
        expect(body.code).toBe("TENANT_NOT_CONFIGURED");
        expect(body.error).toBe("Tenant not configured");
    });

    it("features === undefined → 500 INTERNAL_MISCONFIG on storefront endpoint", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/storefront/ping",
            headers: { "x-test-features": "undefined" }
        });
        expect(res.statusCode).toBe(500);
        const body = res.json();
        expect(body.code).toBe("INTERNAL_MISCONFIG");
        expect(body.error).toContain("tenant features not available");
    });

    it("features === null → 503 TENANT_NOT_CONFIGURED when calling guard-protected route (guard aligned with tenant-context)", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/storefront/time-slots",
            headers: { "x-test-features": "null" }
        });
        expect(res.statusCode).toBe(503);
        const body = res.json();
        expect(body.code).toBe("TENANT_NOT_CONFIGURED");
        expect(body.error).toBe("Tenant not configured");
    });

    it("scheduled ordering tenant off → 403 FEATURE_DISABLED when calling guard-protected route", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/storefront/time-slots",
            headers: { "x-test-features": "scheduled-off" }
        });
        expect(res.statusCode).toBe(403);
        const body = res.json();
        expect(body.code).toBe("FEATURE_DISABLED");
        expect(body.error).toBe("Feature disabled");
    });

    it("features ok → 200 on storefront ping", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/storefront/ping",
            headers: { "x-test-features": "ok" }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
    });

    it("features ok + scheduledOrdering on → 200 on time-slots stub", async () => {
        const res = await app.inject({
            method: "GET",
            url: "/storefront/time-slots",
            headers: { "x-test-features": "ok" }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ slots: [], isScheduledOrderingEnabled: true });
    });

    it("tenant on + branch off + requestedDeliveryTime → 403 SCHEDULED_ORDERING_DISABLED (two-step policy)", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/storefront/checkout-stub",
            headers: { "x-test-features": "ok", "x-test-branch-scheduled": "false" },
            payload: { requestedDeliveryTime: "2026-02-01T12:00:00.000Z" }
        });
        expect(res.statusCode).toBe(403);
        const body = res.json();
        expect(body.code).toBe("SCHEDULED_ORDERING_DISABLED");
        expect(body.error).toBe("Scheduled ordering disabled for this branch");
    });

    it("tenant on + branch on + requestedDeliveryTime → 200 on checkout-stub", async () => {
        const res = await app.inject({
            method: "POST",
            url: "/storefront/checkout-stub",
            headers: { "x-test-features": "ok", "x-test-branch-scheduled": "true" },
            payload: { requestedDeliveryTime: "2026-02-01T12:00:00.000Z" }
        });
        expect(res.statusCode).toBe(200);
        expect(res.json()).toEqual({ ok: true });
    });
});
