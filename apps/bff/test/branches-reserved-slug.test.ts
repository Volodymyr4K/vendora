/**
 * Super-admin branch slug reserved checks.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { validatorCompiler, serializerCompiler } from "fastify-type-provider-zod";
import { authPlugin } from "../src/plugins/auth";
import { routesSuperAdmin } from "../src/domains/super-admin/tenants.routes";

const {
  mockTenantFindUnique,
  mockBranchFindFirst,
  mockBranchFindUnique,
  mockBranchUpdateMany,
} = vi.hoisted(() => ({
  mockTenantFindUnique: vi.fn(),
  mockBranchFindFirst: vi.fn(),
  mockBranchFindUnique: vi.fn(),
  mockBranchUpdateMany: vi.fn(),
}));

vi.mock("@vendora/database", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@vendora/database")>();
  return {
    ...actual,
    prisma: {
      tenant: {
        findUnique: mockTenantFindUnique,
      },
      branch: {
        findFirst: mockBranchFindFirst,
        findUnique: mockBranchFindUnique,
        updateMany: mockBranchUpdateMany,
      },
      $disconnect: vi.fn().mockResolvedValue(undefined),
    },
  };
});

async function buildApp() {
  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fjwt, { secret: "test-secret-branches-reserved" });
  await app.register(authPlugin, { role: "super-admin" });
  await app.register(routesSuperAdmin, { prefix: "/super" });
  return app;
}

function signSuperAdminToken(app: Awaited<ReturnType<typeof buildApp>>) {
  return app.jwt.sign({
    userId: "super-admin-1",
    role: "super-admin",
  });
}

describe("super-admin branch reserved slugs", () => {
  beforeEach(() => {
    mockTenantFindUnique.mockReset();
    mockBranchFindFirst.mockReset();
    mockBranchFindUnique.mockReset();
    mockBranchUpdateMany.mockReset();
  });

  it("POST /super/tenants/:tenantId/branches rejects reserved slug", async () => {
    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "POST",
      url: "/super/tenants/tenant-1/branches",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        name: "Main Branch",
        slug: "profile",
        cityName: "Kyiv",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string; code?: string };
    expect(body.code).toBe("RESERVED_BRANCH_SLUG");
    expect(body.error).toBe("Branch slug is reserved");
  });

  it("PATCH /super/tenants/:tenantId/branches/:branchId rejects reserved slug", async () => {
    mockTenantFindUnique.mockResolvedValue({ id: "tenant-1" });
    mockBranchFindFirst.mockResolvedValue({ id: "branch-1", tenantId: "tenant-1", slug: "berlin" });

    const app = await buildApp();
    const token = signSuperAdminToken(app);
    const res = await app.inject({
      method: "PATCH",
      url: "/super/tenants/tenant-1/branches/branch-1",
      headers: { authorization: `Bearer ${token}` },
      payload: {
        slug: "main",
      },
    });
    expect(res.statusCode).toBe(400);
    const body = res.json() as { error?: string; code?: string };
    expect(body.code).toBe("RESERVED_BRANCH_SLUG");
    expect(body.error).toBe("Branch slug is reserved");
  });
});
