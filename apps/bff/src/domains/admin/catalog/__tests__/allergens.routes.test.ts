/**
 * Phase 5.2: Invariant test — facet write only when tenant has capability "allergens".
 */
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { allergensRoutes } from "../allergens.routes.js";
import type { AdminDeps } from "../../types.js";

describe("Allergens routes (Phase 5.2)", () => {
    it("should return 403 when tenant has no allergens capability", async () => {
        const mockPrisma = {
            catalogItem: { findFirst: async () => ({ id: "item-1", tenantId: "t1" }) },
            itemAllergenFacet: { upsert: async () => ({}) },
        } as unknown as AdminDeps["prisma"];

        const app = Fastify();
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.addHook("onRequest", (request, _reply, done) => {
            (request as { tenant?: { id: string; features: object } }).tenant = {
                id: "t1",
                features: { capabilities: [] },
            };
            done();
        });
        const deps: AdminDeps = {
            prisma: mockPrisma,
            cache: {
                get: async () => null,
                set: async () => {},
                del: async () => {},
                delPattern: async () => {},
                close: async () => {},
                stats: () => ({ kind: "mock" }),
            },
        };
        await app.register(allergensRoutes, deps);

        const res = await app.inject({
            method: "PUT",
            url: "/branch-1/catalog-items/item-1/allergens",
            payload: { allergenCodes: ["gluten"] },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json() as { code?: string; requiredCapability?: string };
        expect(body.code).toBe("CAPABILITY_REQUIRED");
        expect(body.requiredCapability).toBe("allergens");
    });

    it("should accept PUT when tenant has allergens capability", async () => {
        const facet = {
            id: "facet-1",
            tenantId: "t1",
            catalogItemId: "item-1",
            allergenCodes: ["gluten", "nuts"],
            createdAt: new Date(),
            updatedAt: new Date(),
        };
        const mockPrisma = {
            catalogItem: { findFirst: async () => ({ id: "item-1", tenantId: "t1" }) },
            itemAllergenFacet: { upsert: async () => facet },
        } as unknown as AdminDeps["prisma"];

        const app = Fastify();
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.addHook("onRequest", (request, _reply, done) => {
            (request as { tenant?: { id: string; features: { capabilities: string[] } } }).tenant = {
                id: "t1",
                features: { capabilities: ["allergens"] },
            };
            done();
        });
        const deps2: AdminDeps = {
            prisma: mockPrisma,
            cache: {
                get: async () => null,
                set: async () => {},
                del: async () => {},
                delPattern: async () => {},
                close: async () => {},
                stats: () => ({ kind: "mock" }),
            },
        };
        await app.register(allergensRoutes, deps2);

        const res = await app.inject({
            method: "PUT",
            url: "/branch-1/catalog-items/item-1/allergens",
            payload: { allergenCodes: ["gluten", "nuts"] },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as { allergenCodes?: string[] };
        expect(body.allergenCodes).toEqual(["gluten", "nuts"]);
    });
});
