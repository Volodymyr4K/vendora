/**
 * PATCH /super/tenants/:tenantId/theme — reason↔status, Cache-Control, invalidate after commit (plan 1.9, audit 3.9 F).
 * Minimal integration tests: negative cases + happy path + invalidation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { validatorCompiler, serializerCompiler } from "fastify-type-provider-zod";
import { authPlugin } from "../src/plugins/auth";
import domainsRoutes from "../src/domains/super-admin/domains.routes";
import { prisma } from "@vendora/database";
import { cacheManager } from "../src/services/cache-manager";

const { mockExecuteRaw } = vi.hoisted(() => ({ mockExecuteRaw: vi.fn() }));

vi.mock("@vendora/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vendora/database")>();
  return {
    ...actual,
    prisma: {
      $executeRaw: mockExecuteRaw,
      $disconnect: vi.fn().mockResolvedValue(undefined),
    },
    Prisma: {
      ...actual.Prisma,
      sql: (strings: TemplateStringsArray, ...values: unknown[]) => ({ strings, values }),
    },
  };
});

vi.mock("../src/services/cache-manager", () => ({
  cacheManager: { invalidateTenant: vi.fn() },
}));

const VALID_TENANT_ID = "f47ac10b-58cc-4372-a567-0e02b2c3d479";
const VALID_THEME_BODY = {
  version: 1 as const,
  preset: "default" as const,
  tokens: { accent: "#2563eb" },
};

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fjwt, { secret: "test-secret-patch-theme" });
  await app.register(authPlugin, { role: "super-admin" });
  await app.register(domainsRoutes, { prefix: "/super/tenants" });
  return app;
}

function signSuperAdminToken(app: Awaited<ReturnType<typeof buildApp>>) {
  return app.jwt.sign({
    userId: "super-admin-1",
    role: "super-admin",
  });
}

describe("PATCH /super/tenants/:tenantId/theme — reason ↔ HTTP status + allowlist", () => {
  beforeEach(() => {
    mockExecuteRaw.mockReset();
    vi.mocked(cacheManager.invalidateTenant).mockReset();
  });

  it("invalid tenant id (non-UUID) → 400 + error invalid_id", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/super/tenants/not-a-uuid/theme",
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_THEME_BODY,
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_id");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("unknown keys in body → 400 + error unknown_keys", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: { ...VALID_THEME_BODY, unknownKey: "x" },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("unknown_keys");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("non-empty not satisfied (no preset, no tokens) → 400 + error invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1, tokens: {}, brand: undefined },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand-only (no preset, no tokens) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        tokens: {},
        brand: { logoUrl: "https://example.com/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("preset-only (allowlist) → 204", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1, preset: "default", tokens: {} },
    });
    expect(res.statusCode).toBe(204);
    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).toHaveBeenCalledWith(VALID_TENANT_ID);
  });

  it("one valid token only (no preset) → 204", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: { version: 1, tokens: { accent: "#2563eb" } },
    });
    expect(res.statusCode).toBe(204);
    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).toHaveBeenCalledWith(VALID_TENANT_ID);
  });

  it("valid UUID but tenant not found (count 0) → 404 + error tenant_not_found", async () => {
    mockExecuteRaw.mockResolvedValue(0);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_THEME_BODY,
    });
    expect(res.statusCode).toBe(404);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("tenant_not_found");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("happy path: valid theme → 204, invalidateTenant called after commit", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: VALID_THEME_BODY,
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).toHaveBeenCalledWith(VALID_TENANT_ID);
  });

  it("canonical theme within 16KB (large but valid) → 204", async () => {
    // Large valid theme (brand URLs near max) → canonical size under 16KB; guards off-by-one
    const longUrl = "https://example.com/" + "x".repeat(2000); // valid URL, under 2048
    mockExecuteRaw.mockResolvedValue(1);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1 as const,
        preset: "default" as const,
        tokens: { accent: "#2563eb" },
        brand: {
          logoUrl: longUrl,
          faviconUrl: longUrl,
          fontUrl: longUrl,
          ogImage: longUrl,
        },
      },
    });
    expect(res.statusCode).toBe(204);
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).toHaveBeenCalledWith(VALID_TENANT_ID);
  });

  it("canonical theme over 16KB → 400 invalid_payload", async () => {
    // brand is stored as-is in canonical theme; length must push JSON over 16KB
    const hugeBrand = "x".repeat(16384);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1 as const,
        preset: "default" as const,
        tokens: { accent: "#2563eb" },
        brand: hugeBrand,
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(res.headers["cache-control"]).toBe("private, no-store");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL http:// (non-HTTPS) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "http://evil.com/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL ip-literal (IPv6) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://[::1]/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL private IP (127.0.0.1) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://127.0.0.1/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL localhost → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://localhost/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL .local host → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://foo.local/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL localhost. (trailing dot) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://localhost./logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL .local. (trailing dot) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://foo.local./logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL empty host (e.g. https://./) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://./logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL IPv4-mapped IPv6 (::ffff:127.0.0.1) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://[::ffff:127.0.0.1]/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL numeric hostname (decimal IP, e.g. 2130706433 = 127.0.0.1) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://2130706433/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL uppercase .LOCAL. (case-normalization) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://foo.LOCAL./logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL localhost with port (hostname still localhost) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://localhost:443/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("brand URL with userinfo (user:pass@) → 400 invalid_payload", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1,
        preset: "default",
        tokens: {},
        brand: { logoUrl: "https://user:pass@example.com/logo.png" },
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string };
    expect(body.error).toBe("invalid_payload");
    expect(mockExecuteRaw).not.toHaveBeenCalled();
    expect(cacheManager.invalidateTenant).not.toHaveBeenCalled();
  });

  it("persists canonical theme (lowercase hex, jsonb object not string)", async () => {
    mockExecuteRaw.mockResolvedValue(1);
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: `/super/tenants/${VALID_TENANT_ID}/theme`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        version: 1 as const,
        preset: "default" as const,
        tokens: { accent: "#ABC" }, // short hex + uppercase → canonical #aabbcc
      },
    });
    expect(res.statusCode).toBe(204);
    expect(mockExecuteRaw).toHaveBeenCalled();
    const sqlArg = mockExecuteRaw.mock.calls[0]?.[0] as { strings: string[]; values: unknown[] } | undefined;
    expect(sqlArg).toBeDefined();
    expect(sqlArg?.values).toBeDefined();
    // PATCH SQL shape: jsonb_set, path '{theme}', COALESCE(settings, '{}'::jsonb), ::jsonb cast on theme param
    const sqlTemplate =
      sqlArg && Array.isArray(sqlArg.strings) ? (sqlArg.strings as string[]).join("") : "";
    expect(sqlTemplate).toContain("jsonb_set");
    expect(sqlTemplate).toContain("'{theme}'");
    expect(sqlTemplate).toContain("COALESCE(settings, '{}'::jsonb)");
    expect(sqlTemplate).toContain("::jsonb");
    const themeJsonParam = sqlArg?.values[0];
    expect(typeof themeJsonParam).toBe("string");
    const parsed = JSON.parse(themeJsonParam as string) as Record<string, unknown>;
    // 1.5: stored value must be JSON object, not a string
    expect(typeof parsed).toBe("object");
    expect(parsed).not.toBe(null);
    expect(Array.isArray(parsed)).toBe(false);
    const tokens = parsed.tokens as Record<string, unknown> | undefined;
    expect(tokens).toBeDefined();
    // 1.4: canonical lowercase hex (#ABC → #aabbcc)
    expect(tokens?.accent).toBe("#aabbcc");
  });
});
