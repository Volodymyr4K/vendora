/**
 * ACCESS_LEVELS Phase 1.5: CI skeleton — every required admin routeId must have a registry entry.
 * When adding a new /admin/* route, add its routeId to REQUIRED_ADMIN_ROUTE_IDS and add an entry to ADMIN_ROUTE_REGISTRY;
 * otherwise this test fails.
 */

import { describe, it, expect } from "vitest";
import {
    ADMIN_ROUTE_REGISTRY,
    REQUIRED_ADMIN_ROUTE_IDS,
    getAdminRouteEntry,
} from "../admin-route-registry.js";

describe("admin-route-registry", () => {
    it("every REQUIRED_ADMIN_ROUTE_IDS has an entry in ADMIN_ROUTE_REGISTRY", () => {
        const missing: string[] = [];
        for (const routeId of REQUIRED_ADMIN_ROUTE_IDS) {
            const entry = getAdminRouteEntry(routeId);
            if (!entry) missing.push(routeId);
        }
        expect(missing, `Missing registry entries for: ${missing.join(", ")}`).toEqual([]);
    });

    it("registry entries have valid structure (routeId, moduleId, action)", () => {
        for (const entry of ADMIN_ROUTE_REGISTRY) {
            expect(entry.routeId).toBeDefined();
            expect(typeof entry.routeId).toBe("string");
            expect(entry.moduleId).toBeDefined();
            expect(["read", "write"]).toContain(entry.action);
        }
    });
});
