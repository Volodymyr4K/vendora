/**
 * ACCESS_LEVELS Phase 1.5: CI coverage for admin route registry.
 * - Every registered /admin/* route (except whitelist) must have an entry in ADMIN_ROUTE_REGISTRY.
 * - Every ADMIN_ROUTE_REGISTRY entry must have a corresponding registered route.
 * When adding a new /admin/* route, add its routeId and entry to the registry; otherwise this test fails.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import type { RouteOptions } from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { routesAdmin } from "../../domains/admin/admin.routes.js";
import { routesUpload } from "../../domains/admin/media/media.routes.js";
import type { RoutesDependencies } from "../../types/dependencies.js";
import { getRouteIdFromMethodAndUrl } from "../../lib/get-route-id.js";
import { ADMIN_ROUTE_IDS, ADMIN_ROUTE_REGISTRY } from "../../lib/admin-route-registry.js";
import { OWNER_ONLY_ADMIN_MODULE_IDS } from "@vendora/contracts";

/** Routes that are valid /admin/* but not in ADMIN_ROUTE_REGISTRY (e.g. whitelisted in guard). */
const REGISTRY_WHITELIST = new Set<string>(["GET /me"]);

/** Minimal deps for route registration only; handlers are never invoked. */
function minimalAdminDeps(): RoutesDependencies {
    return {
        prisma: {} as RoutesDependencies["prisma"],
        cache: {} as RoutesDependencies["cache"],
        config: {} as RoutesDependencies["config"],
        ttlSec: 60,
        staleSec: 30,
        swr: true,
    };
}

describe("Admin route registry CI coverage", () => {
    let app: FastifyInstance;
    const collected: { method: string; url: string }[] = [];

    beforeAll(async () => {
        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);

        app.addHook("onRoute", (opts: RouteOptions & { routePath?: string; path?: string; prefix?: string }) => {
            const url = opts.url ?? opts.routePath ?? opts.path ?? "";
            const methods = Array.isArray(opts.method) ? opts.method : [opts.method];
            for (const method of methods) {
                collected.push({ method: String(method), url });
            }
        });

        await app.register(
            async (adminScope) => {
                await routesAdmin(adminScope, minimalAdminDeps());
                await routesUpload(adminScope);
            },
            { prefix: "/admin" }
        );

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("every registered /admin/* route (except whitelist) has an entry in ADMIN_ROUTE_REGISTRY", () => {
        const missing: string[] = [];
        for (const { method, url } of collected) {
            if (url !== "/admin" && !url.startsWith("/admin/")) continue;
            const routeId = getRouteIdFromMethodAndUrl(method, url);
            if (routeId === null) continue;
            if (REGISTRY_WHITELIST.has(routeId)) continue;
            const lookupId = method === "HEAD" ? "GET " + routeId.split(" ", 2)[1] : routeId;
            if (REGISTRY_WHITELIST.has(lookupId)) continue;
            if (!ADMIN_ROUTE_IDS.has(lookupId)) missing.push(routeId);
        }
        expect(
            missing,
            `Registered routes missing from ADMIN_ROUTE_REGISTRY: ${missing.join(", ")}. Add entries to admin-route-registry.ts.`
        ).toEqual([]);
    });

    it("every ADMIN_ROUTE_REGISTRY entry has a corresponding registered route", () => {
        const registeredRouteIds = new Set<string>();
        for (const { method, url } of collected) {
            if (url !== "/admin" && !url.startsWith("/admin/")) continue;
            const routeId = getRouteIdFromMethodAndUrl(method, url);
            if (routeId !== null) {
                registeredRouteIds.add(routeId);
                if (method === "HEAD") registeredRouteIds.add("GET " + routeId.split(" ", 2)[1]);
            }
        }
        const missing: string[] = [];
        for (const entry of ADMIN_ROUTE_REGISTRY) {
            if (!registeredRouteIds.has(entry.routeId)) missing.push(entry.routeId);
        }
        expect(
            missing,
            `ADMIN_ROUTE_REGISTRY entries with no registered route: ${missing.join(", ")}. Register the route or remove from registry.`
        ).toEqual([]);
    });

    /** AUDIT 7 fix 12.2: CI invariant — every moduleId in OWNER_ONLY_ADMIN_MODULE_IDS has all registry entries with ownerOnly: true. */
    it("every OWNER_ONLY_ADMIN_MODULE_IDS module has all registry entries ownerOnly: true", () => {
        const violations: string[] = [];
        for (const moduleId of OWNER_ONLY_ADMIN_MODULE_IDS) {
            const entries = ADMIN_ROUTE_REGISTRY.filter((e) => e.moduleId === moduleId);
            for (const entry of entries) {
                if (!entry.ownerOnly) {
                    violations.push(`${entry.routeId} (moduleId: ${moduleId}) must have ownerOnly: true`);
                }
            }
        }
        expect(
            violations,
            `OWNER_ONLY_ADMIN_MODULE_IDS invariant violated: ${violations.join("; ")}. Add ownerOnly: true to these entries or remove moduleId from OWNER_ONLY_ADMIN_MODULE_IDS in contracts.`
        ).toEqual([]);
    });
});
