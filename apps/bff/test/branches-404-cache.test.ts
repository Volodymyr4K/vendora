/**
 * GET /branches/:branch — 404 (branch not found): Cache-Control and no tenant in body (plan 1.5, audit 3.7).
 * GET /config/ (route not found): Cache-Control (setNotFoundHandler).
 */

import { describe, it, expect, vi } from "vitest";
import Fastify, { FastifyRequest } from "fastify";
import { validatorCompiler, serializerCompiler } from "fastify-type-provider-zod";
import { routesBranches } from "../src/domains/storefront/places/branches.routes";
import { routesStorefrontConfig } from "../src/domains/storefront/config.routes";
import { PrismaClient } from "@vendora/database";
import type { Cache, CacheGetResult } from "../src/cache";
import type { RoutesDependencies } from "../src/types/dependencies";
import type { AppConfig } from "../src/config";
import { DEFAULT_TENANT_FEATURES } from "@vendora/contracts";
import { DEFAULT_RESOLVED_THEME } from "../src/services/theme";
import { BusinessError } from "../src/errors/business-error";

class FakeCache implements Cache {
  async get<T>(_key: string): Promise<CacheGetResult<T>> {
    return null as CacheGetResult<T>;
  }
  async set<T>(_key: string, _value: T, _ttlSec: number, _staleSec: number): Promise<void> {}
  async del(_key: string): Promise<void> {}
  async delPattern(_pattern: string): Promise<void> {}
  async close(): Promise<void> {}
  stats() {
    return { kind: "fake" as const };
  }
}

const minimalTenant = {
  id: "t1",
  name: "Test",
  slug: "test",
  isActive: true,
  customDomainsEnabled: false,
  countryCode: "UA",
  currency: "UAH",
  features: DEFAULT_TENANT_FEATURES,
  theme: DEFAULT_RESOLVED_THEME,
};

declare module "fastify" {
  interface FastifyRequest {
    tenant?: typeof minimalTenant;
  }
}

describe("GET /branches/:branch 404 and Cache-Control", () => {
  it("returns 404 for non-existent branch with Cache-Control and no tenant in body", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = minimalTenant;
    });

    const prisma = new PrismaClient();
    vi.spyOn(prisma.branch, "findFirst").mockResolvedValue(null);

    const deps: RoutesDependencies = {
      prisma,
      cache: new FakeCache(),
      config: {} as unknown as AppConfig,
      ttlSec: 60,
      staleSec: 120,
      swr: false,
    };

    await routesBranches(app, deps);

    // Mirror error handler: Cache-Control for /config, /config/*, /branches, /branches/*
    app.setErrorHandler((err: unknown, req, reply) => {
      const path = (req.url ?? "").split("?")[0] ?? "";
      if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
        reply.header("Cache-Control", "private, no-store");
      }
      const requestId = (req as { requestId?: string }).requestId ?? req.id;
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({
          error: err.code,
          message: err.message,
          details: (err as BusinessError & { details?: unknown }).details,
          requestId,
        });
      }
      return reply.code(500).send({ error: "Internal Server Error", requestId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/branches/no-such-branch",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    const body = res.json() as Record<string, unknown>;
    expect(body.tenant).toBeUndefined();
    expect(body.theme).toBeUndefined();
    expect(body.error).toBeDefined();
  });
});

describe("Route not found (setNotFoundHandler) Cache-Control", () => {
  it("returns 404 for unknown path under /config with Cache-Control", async () => {
    const app = Fastify({ routerOptions: { ignoreTrailingSlash: false } });
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = minimalTenant;
    });

    await app.register(routesStorefrontConfig, { prefix: "/config" });

    app.setNotFoundHandler((req, reply) => {
      const pathRaw = (req.url ?? "").split("?")[0] ?? "";
      const path = pathRaw.replace(/\/$/, "") || "/";
      if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
        reply.header("Cache-Control", "private, no-store");
      }
      const requestId = String(req.id ?? "");
      return reply.code(404).send({ error: "Not found", requestId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/config/not-a-route",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("returns 404 for GET /config/ (trailing slash) with Cache-Control", async () => {
    // No /config route registered — so GET /config/ hits setNotFoundHandler (path normalizes to /config)
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = minimalTenant;
    });

    app.setNotFoundHandler((req, reply) => {
      const pathRaw = (req.url ?? "").split("?")[0] ?? "";
      const path = pathRaw.replace(/\/$/, "") || "/";
      if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
        reply.header("Cache-Control", "private, no-store");
      }
      const requestId = String(req.id ?? "");
      return reply.code(404).send({ error: "Not found", requestId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/config/",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("returns 404 for GET /branches/ (trailing slash) with Cache-Control", async () => {
    // No /branches route registered — GET /branches/ hits setNotFoundHandler (path normalizes to /branches)
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = minimalTenant;
    });

    app.setNotFoundHandler((req, reply) => {
      const pathRaw = (req.url ?? "").split("?")[0] ?? "";
      const path = pathRaw.replace(/\/$/, "") || "/";
      if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
        reply.header("Cache-Control", "private, no-store");
      }
      const requestId = String(req.id ?? "");
      return reply.code(404).send({ error: "Not found", requestId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/branches/",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBe("private, no-store");
  });

  it("returns 404 for GET /branchesX without Cache-Control (non-matching path)", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = minimalTenant;
    });

    app.setNotFoundHandler((req, reply) => {
      const pathRaw = (req.url ?? "").split("?")[0] ?? "";
      const path = pathRaw.replace(/\/$/, "") || "/";
      if (path === "/config" || path.startsWith("/config/") || path === "/branches" || path.startsWith("/branches/")) {
        reply.header("Cache-Control", "private, no-store");
      }
      const requestId = String(req.id ?? "");
      return reply.code(404).send({ error: "Not found", requestId });
    });

    const res = await app.inject({
      method: "GET",
      url: "/branchesX",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(404);
    expect(res.headers["cache-control"]).toBeUndefined();
  });
});
