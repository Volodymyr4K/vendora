/**
 * Unit tests for feature-guard (AUDIT_6 Step 6/8).
 * Covers: granular → master → default; 403 FEATURE_DISABLED body.
 */

import { describe, it, expect, vi } from "vitest";
import {
    isStorefrontFeatureEnabled,
    requireStorefrontFeature
} from "../feature-guard.js";
import type { TenantFeatures } from "@vendora/contracts";

const fullFeatures = (overrides: Partial<TenantFeatures["modules"]> = {}): TenantFeatures => ({
    version: 1,
    modules: {
        profile: true,
        ordering: true,
        delivery: true,
        menu: true,
        customerProfiles: true,
        orderHistory: true,
        savedAddresses: true,
        favorites: true,
        cartCheckout: true,
        scheduledOrdering: true,
        quickReorder: true,
        basicDelivery: true,
        ...overrides
    },
    adminModules: {},
    capabilities: []
});

describe("feature-guard", () => {
    describe("isStorefrontFeatureEnabled", () => {
        it("returns true when granular flag is true", () => {
            const f = fullFeatures({ profile: true });
            expect(isStorefrontFeatureEnabled(f, "profile")).toBe(true);
            expect(isStorefrontFeatureEnabled(f, "customerProfiles", "profile")).toBe(true);
        });

        it("returns false when granular flag is false (no master fallback for same key)", () => {
            const f = fullFeatures({ customerProfiles: false, profile: true });
            expect(isStorefrontFeatureEnabled(f, "customerProfiles", "profile")).toBe(false);
        });

        it("granular false overrides master (no fallback when granular is explicitly false)", () => {
            const f = fullFeatures({ profile: true, customerProfiles: false });
            expect(isStorefrontFeatureEnabled(f, "customerProfiles", "profile")).toBe(false);
        });

        it("returns false when both granular and master are false", () => {
            const f = fullFeatures({ profile: false, customerProfiles: false });
            expect(isStorefrontFeatureEnabled(f, "customerProfiles", "profile")).toBe(false);
        });

        it("returns true when modules missing (default)", () => {
            const f = { version: 1, modules: undefined as unknown as TenantFeatures["modules"], adminModules: {}, capabilities: [] };
            expect(isStorefrontFeatureEnabled(f as TenantFeatures, "profile")).toBe(true);
        });
    });

    describe("requireStorefrontFeature", () => {
        it("returns true when feature enabled and does not send reply", async () => {
            const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
            const req = { tenant: { features: fullFeatures({ profile: true }) } };
            const out = requireStorefrontFeature(
                req as Parameters<typeof requireStorefrontFeature>[0],
                reply as unknown as Parameters<typeof requireStorefrontFeature>[1],
                "customerProfiles",
                "profile"
            );
            expect(out).toBe(true);
            expect(reply.code).not.toHaveBeenCalled();
        });

        it("returns false and sends 403 FEATURE_DISABLED when feature disabled", async () => {
            const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
            const req = { tenant: { features: fullFeatures({ profile: false, customerProfiles: false }) } };
            const out = requireStorefrontFeature(
                req as Parameters<typeof requireStorefrontFeature>[0],
                reply as unknown as Parameters<typeof requireStorefrontFeature>[1],
                "customerProfiles",
                "profile"
            );
            expect(out).toBe(false);
            expect(reply.code).toHaveBeenCalledWith(403);
            expect(reply.send).toHaveBeenCalledWith({ error: "Feature disabled", code: "FEATURE_DISABLED" });
        });

        it("returns false and sends 503 TENANT_NOT_CONFIGURED when tenant.features is null (aligned with tenant-context)", () => {
            const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
            const req = { tenant: { features: null } };
            const out = requireStorefrontFeature(
                req as Parameters<typeof requireStorefrontFeature>[0],
                reply as unknown as Parameters<typeof requireStorefrontFeature>[1],
                "profile"
            );
            expect(out).toBe(false);
            expect(reply.code).toHaveBeenCalledWith(503);
            expect(reply.send).toHaveBeenCalledWith({
                error: "Tenant not configured",
                code: "TENANT_NOT_CONFIGURED"
            });
        });

        it("returns false and sends 500 INTERNAL_MISCONFIG when tenant.features is undefined (invariant broken, no bypass)", () => {
            const reply = { code: vi.fn().mockReturnThis(), send: vi.fn() };
            const req = { tenant: {} };
            const out = requireStorefrontFeature(
                req as Parameters<typeof requireStorefrontFeature>[0],
                reply as unknown as Parameters<typeof requireStorefrontFeature>[1],
                "profile"
            );
            expect(out).toBe(false);
            expect(reply.code).toHaveBeenCalledWith(500);
            expect(reply.send).toHaveBeenCalledWith({
                error: "Server configuration error: tenant features not available",
                code: "INTERNAL_MISCONFIG"
            });
        });
    });
});
