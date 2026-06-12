/**
 * ACCESS_LEVELS Phase 2: Unit test for getRouteId — ensures runtime routeId matches registry format.
 */

import { describe, it, expect } from "vitest";
import { getRouteId } from "../get-route-id.js";
import { getAdminRouteEntry } from "../admin-route-registry.js";

function mockReq(method: string, routerPath: string, url?: string) {
    return { method, url: url ?? routerPath, routerPath };
}

describe("getRouteId", () => {
    it("normalizes :branchSlug to :branch for GET /:branch/orders", () => {
        const req = mockReq("GET", "/:branchSlug/orders");
        expect(getRouteId(req)).toBe("GET /:branch/orders");
    });

    it("normalizes :branchSlug to :branch for GET /:branch/stats", () => {
        const req = mockReq("GET", "/:branchSlug/stats");
        expect(getRouteId(req)).toBe("GET /:branch/stats");
    });

    it("normalizes :orderId to :id", () => {
        const req = mockReq("PATCH", "/:branchSlug/orders/:orderId");
        expect(getRouteId(req)).toBe("PATCH /:branch/orders/:id");
    });

    it("produces routeIds that match ADMIN_ROUTE_REGISTRY entries", () => {
        const reqOrders = mockReq("GET", "/:branchSlug/orders");
        const reqStats = mockReq("GET", "/:branchSlug/stats");
        expect(getAdminRouteEntry(getRouteId(reqOrders))).toBeDefined();
        expect(getAdminRouteEntry(getRouteId(reqStats))).toBeDefined();
    });

    it("uses routeOptions.url when routerPath is undefined", () => {
        const req = { method: "GET", routeOptions: { url: "/admin/:branchSlug/stats" } };
        expect(getRouteId(req)).toBe("GET /:branch/stats");
    });
});
