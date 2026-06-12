/**
 * Phase 1.4: Invariant test — facet write only when tenant has capability "nutrition".
 */
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { nutritionRoutes } from "../nutrition.routes.js";
import type { AdminDeps } from "../../types.js";

describe("Nutrition routes (Phase 1.4)", () => {
    it("should return 403 when tenant has no nutrition capability", async () => {
        const mockPrisma = {
            catalogItem: { findFirst: async () => ({ id: "item-1", tenantId: "t1" }) },
            itemNutritionFacet: { upsert: async () => ({}) },
        } as unknown as AdminDeps["prisma"];

        const app = Fastify();
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.addHook("onRequest", (request, _reply, done) => {
            (request as { tenant?: { id: string; features: object } }).tenant = {
                id: "t1",
                features: { capabilities: [] }, // no "nutrition"
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
        await app.register(nutritionRoutes, deps);

        const res = await app.inject({
            method: "PUT",
            url: "/branch-1/catalog-items/item-1/nutrition",
            payload: { caloriesKcal: 100 },
        });

        expect(res.statusCode).toBe(403);
        const body = res.json() as { code?: string; requiredCapability?: string };
        expect(body.code).toBe("CAPABILITY_REQUIRED");
        expect(body.requiredCapability).toBe("nutrition");
    });

    it("should accept PUT when tenant has nutrition capability", async () => {
        const facet = { id: "facet-1", tenantId: "t1", catalogItemId: "item-1", caloriesKcal: 100, proteinG: null, fatG: null, carbsG: null, createdAt: new Date(), updatedAt: new Date() };
        const mockPrisma = {
            catalogItem: { findFirst: async () => ({ id: "item-1", tenantId: "t1" }) },
            itemNutritionFacet: { upsert: async () => facet },
        } as unknown as AdminDeps["prisma"];

        const app = Fastify();
        app.setValidatorCompiler(validatorCompiler);
        app.setSerializerCompiler(serializerCompiler);
        app.addHook("onRequest", (request, _reply, done) => {
            (request as { tenant?: { id: string; features: { capabilities: string[] } } }).tenant = {
                id: "t1",
                features: { capabilities: ["nutrition"] },
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
        await app.register(nutritionRoutes, deps2);

        const res = await app.inject({
            method: "PUT",
            url: "/branch-1/catalog-items/item-1/nutrition",
            payload: { caloriesKcal: 100 },
        });

        expect(res.statusCode).toBe(200);
        const body = res.json() as { caloriesKcal?: number };
        expect(body.caloriesKcal).toBe(100);
    });
});
