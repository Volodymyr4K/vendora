/**
 * GET /config returns theme (ResolvedTheme); GET /branches/:branch returns tenant.theme (plan 1.10).
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
  async set<T>(_key: string, _value: T, _ttlSec: number, _staleSec: number): Promise<void> { }
  async del(_key: string): Promise<void> { }
  async delPattern(_pattern: string): Promise<void> { }
  async close(): Promise<void> { }
  stats() {
    return { kind: "fake" as const };
  }
}

const tenantWithTheme = {
  id: "t1",
  name: "Test",
  slug: "test",
  isActive: true,
  customDomainsEnabled: false,
  countryCode: "UA",
  currency: "UAH",
  features: DEFAULT_TENANT_FEATURES,
  theme: {
    ...DEFAULT_RESOLVED_THEME,
    tokens: { ...DEFAULT_RESOLVED_THEME.tokens, accent: "#f2a65a" },
  },
};

declare module "fastify" {
  interface FastifyRequest {
    tenant?: typeof tenantWithTheme;
  }
}

describe("GET /config — theme in response", () => {
  it("returns theme (ResolvedTheme) when tenant has theme", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = tenantWithTheme;
    });
    await app.register(routesStorefrontConfig, { prefix: "/config" });

    const res = await app.inject({
      method: "GET",
      url: "/config",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { theme?: { tokens?: { accent?: string }; layoutPreset?: string; componentSet?: string }; name?: string };
    expect(body.theme).toBeDefined();
    expect(body.theme?.tokens).toBeDefined();
    expect(body.theme?.tokens?.accent).toBe("#f2a65a");
    // Phase 2.1: layoutPreset in response
    expect(body.theme?.layoutPreset).toBe("default");

    // Phase 3.1: componentSet in response
    expect(body.theme?.componentSet).toBe("default");
    expect(body.name).toBe("Test");
  });
});

describe("GET /branches/:branch — tenant.theme in response", () => {
  it("returns tenant.theme when branch exists", async () => {
    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);
    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = tenantWithTheme;
    });

    const prisma = new PrismaClient();
    vi.spyOn(prisma.branch, "findFirst").mockResolvedValue({
      id: "b1",
      tenantId: "t1",
      slug: "kyiv",
      cityName: "Kyiv",
      address: null,
      phones: [],
      deliveryFee: 0,
      freeFrom: 0,
      etaMin: 30,
      etaMax: 60,
      zones: [],
      isActive: true,
      workingSchedule: null,
      tenant: { features: DEFAULT_TENANT_FEATURES },
    } as unknown as import("@vendora/database").Branch);

    const deps: RoutesDependencies = {
      prisma,
      cache: new FakeCache(),
      config: {} as unknown as AppConfig,
      ttlSec: 60,
      staleSec: 120,
      swr: false,
    };
    await routesBranches(app, deps);

    app.setErrorHandler((err: unknown, req, reply) => {
      const path = (req.url ?? "").split("?")[0] ?? "";
      if (path.startsWith("/branches/")) {
        reply.header("Cache-Control", "private, no-store");
      }
      if (err instanceof BusinessError) {
        return reply.code(err.statusCode).send({
          error: err.code,
          message: err.message,
          details: (err as BusinessError & { details?: unknown }).details,
        });
      }
      return reply.code(500).send({ error: "Internal Server Error" });
    });

    const res = await app.inject({
      method: "GET",
      url: "/branches/kyiv",
      headers: { "x-tenant-slug": "test" },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as { tenant?: { name?: string; theme?: { tokens?: { accent?: string }; layoutPreset?: string; componentSet?: string } }; slug?: string };
    expect(body.tenant).toBeDefined();
    expect(body.tenant?.name).toBe("Test");
    expect(body.tenant?.theme).toBeDefined();
    expect(body.tenant?.theme?.tokens?.accent).toBe("#f2a65a");
    // Phase 2.1: layoutPreset in tenant.theme
    expect(body.tenant?.theme?.layoutPreset).toBe("default");

    // Phase 3.1: componentSet in tenant.theme
    expect(body.tenant?.theme?.componentSet).toBe("default");
    expect(body.slug).toBe("kyiv");
  });
});

describe("Theme invalidation (PATCH → invalidate → GET /config sees new theme)", () => {
  it("GET /config returns theme from req.tenant; after simulated invalidation, second request with updated tenant returns new accent", async () => {
    const themeA = {
      ...DEFAULT_RESOLVED_THEME,
      tokens: { ...DEFAULT_RESOLVED_THEME.tokens, accent: "#111111" },
    };
    const themeB = {
      ...DEFAULT_RESOLVED_THEME,
      tokens: { ...DEFAULT_RESOLVED_THEME.tokens, accent: "#222222" },
    };

    const app = Fastify();
    app.setValidatorCompiler(validatorCompiler);
    app.setSerializerCompiler(serializerCompiler);

    let useThemeB = false;
    app.addHook("onRequest", async (req: FastifyRequest) => {
      req.tenant = {
        ...tenantWithTheme,
        theme: useThemeB ? themeB : themeA,
      };
    });
    await app.register(routesStorefrontConfig, { prefix: "/config" });

    const res1 = await app.inject({
      method: "GET",
      url: "/config",
      headers: { "x-tenant-slug": "test" },
    });
    expect(res1.statusCode).toBe(200);
    const body1 = res1.json() as { theme?: { tokens?: { accent?: string } } };
    expect(body1.theme?.tokens?.accent).toBe("#111111");

    useThemeB = true;

    const res2 = await app.inject({
      method: "GET",
      url: "/config",
      headers: { "x-tenant-slug": "test" },
    });
    expect(res2.statusCode).toBe(200);
    const body2 = res2.json() as { theme?: { tokens?: { accent?: string } } };
    expect(body2.theme?.tokens?.accent).toBe("#222222");
  });
});
