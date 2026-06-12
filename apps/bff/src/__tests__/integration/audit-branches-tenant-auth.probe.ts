/**
 * AUDIT-ONLY Runtime Probe: GET /super/tenants/:tenantId/branches
 * Tests authorization and scoping for branches endpoint
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import fjwt from "@fastify/jwt";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { authPlugin } from "../../plugins/auth.js";
import { routesSuperAdmin } from "../../domains/super-admin/tenants.routes.js";
import { prisma } from "@vendora/database";

const RANDOM_UUID = "00000000-0000-0000-0000-000000000000";

describe("AUDIT: GET /super/tenants/:tenantId/branches authorization", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify({ logger: false });
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        await app.register(fjwt, { secret: process.env.JWT_SECRET || "test-secret-audit-branches" });

        await app.register(async (superScope) => {
            await superScope.register(authPlugin, { role: "super-admin" });
            await superScope.register(routesSuperAdmin);
        }, { prefix: "/super" });

        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("WITH super-admin token + random UUID tenantId → should return 404 (tenant not found), not leak data", async () => {
        const token = await app.jwt.sign({
            userId: "audit-user-001",
            role: "SUPER_ADMIN",
            username: "audit@test.com",
        });

        const response = await app.inject({
            method: "GET",
            url: `/super/tenants/${RANDOM_UUID}/branches`,
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        console.log(`[AUDIT] Status: ${response.statusCode}`);
        console.log(`[AUDIT] Body: ${JSON.stringify(response.json(), null, 2)}`);

        expect(response.statusCode).toBe(404);
        const body = response.json() as { error?: string };
        expect(body.error).toBe("Tenant not found");
    });

    it("WITHOUT auth token → should return 401/403, not 404", async () => {
        const response = await app.inject({
            method: "GET",
            url: `/super/tenants/${RANDOM_UUID}/branches`,
            headers: {},
        });

        console.log(`[AUDIT] Status (no auth): ${response.statusCode}`);
        console.log(`[AUDIT] Body (no auth): ${JSON.stringify(response.json(), null, 2)}`);

        expect([401, 403]).toContain(response.statusCode);
        expect(response.statusCode).not.toBe(404);
    });

    it("WITH wrong role token → should return 403", async () => {
        const token = await app.jwt.sign({
            userId: "audit-user-002",
            role: "TENANT_OWNER",
            username: "audit2@test.com",
            tenantId: "some-tenant-id",
        });

        const response = await app.inject({
            method: "GET",
            url: `/super/tenants/${RANDOM_UUID}/branches`,
            headers: {
                authorization: `Bearer ${token}`,
            },
        });

        console.log(`[AUDIT] Status (wrong role): ${response.statusCode}`);
        console.log(`[AUDIT] Body (wrong role): ${JSON.stringify(response.json(), null, 2)}`);

        expect(response.statusCode).toBe(403);
    });
});
