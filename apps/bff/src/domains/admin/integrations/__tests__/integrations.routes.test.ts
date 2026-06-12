/**
 * Audit 4: entityType in query for GET mappings — unknown → 400, known → 200.
 */
import { describe, it, expect } from "vitest";
import Fastify from "fastify";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { integrationsRoutes } from "../integrations.routes.js";
import type { AdminDeps } from "../../types.js";

describe("Integrations routes (entityType query validation)", () => {
  const baseDeps: AdminDeps = {
    prisma: {
      integration: { findUnique: async () => ({ id: "int-1", tenantId: "t1", provider: "my_provider", credentialsRef: null, status: "PENDING", createdAt: new Date(), updatedAt: new Date() }) },
      externalMapping: { findMany: async () => [] },
    } as unknown as AdminDeps["prisma"],
    cache: {
      get: async () => null,
      set: async () => {},
      del: async () => {},
      delPattern: async () => {},
      close: async () => {},
      stats: () => ({ kind: "mock" }),
    },
  };

  it("should return 400 with INVALID_ENTITY_TYPE when entityType in query is unknown", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook("onRequest", (request, _reply, done) => {
      (request as { tenant?: { id: string } }).tenant = { id: "t1" };
      done();
    });
    await app.register(integrationsRoutes, baseDeps);

    const res = await app.inject({
      method: "GET",
      url: "/integrations/my_provider/mappings?entityType=unknown_type",
    });

    expect(res.statusCode).toBe(400);
    const body = res.json() as { code?: string; allowed?: readonly string[] };
    expect(body.code).toBe("INVALID_ENTITY_TYPE");
    expect(body.allowed).toEqual(["catalog_item", "order", "branch", "item_variant"]);
  });

  it("should return 200 when entityType in query is known", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook("onRequest", (request, _reply, done) => {
      (request as { tenant?: { id: string } }).tenant = { id: "t1" };
      done();
    });
    await app.register(integrationsRoutes, baseDeps);

    const res = await app.inject({
      method: "GET",
      url: "/integrations/my_provider/mappings?entityType=catalog_item",
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as unknown[];
    expect(Array.isArray(body)).toBe(true);
  });
});
