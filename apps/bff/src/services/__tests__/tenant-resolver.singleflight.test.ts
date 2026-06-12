import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { resolveTenant } from "../tenant-resolver.js";
import { cacheManager } from "../cache-manager.js";

function delay(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// Minimal tenant shape to satisfy TENANT_SELECT_FOR_CACHE consumers
function makeTenantRow(overrides: Partial<any> = {}) {
  return {
    id: "t1",
    slug: "test",
    name: "Test Tenant",
    isActive: true,
    customDomainsEnabled: true,
    branchesMode: "SINGLE",
    defaultBranchId: null,
    defaultBranch: null,
    countryCode: "UA",
    currency: "UAH",
    timezone: "Europe/Kyiv",
    features: {},
    settings: {},
    ...overrides,
  };
}

describe("tenant-resolver single-flight", () => {
  const prevCustomDomainsEnabled = process.env.CUSTOM_DOMAINS_ENABLED;
  const prevBaseDomain = process.env.BASE_DOMAIN;

  beforeEach(() => {
    cacheManager.clear();
    process.env.BASE_DOMAIN = "vendora.local";
    delete process.env.CUSTOM_DOMAINS_ENABLED;
  });

  afterEach(() => {
    cacheManager.clear();
    process.env.CUSTOM_DOMAINS_ENABLED = prevCustomDomainsEnabled;
    process.env.BASE_DOMAIN = prevBaseDomain;
    vi.restoreAllMocks();
  });

  it("dedupes L1 MISS under concurrency for subdomains (domain -> tenantId)", async () => {
    let tenantFindUniqueCalls = 0;

    const prisma: any = {
      tenant: {
        findUnique: vi.fn(async () => {
          tenantFindUniqueCalls += 1;
          await delay(50);
          return makeTenantRow({ id: "t-sub", slug: "test" });
        }),
      },
      customDomain: {
        findFirst: vi.fn(async () => {
          throw new Error("customDomain.findFirst should not be called for subdomains");
        }),
      },
    };

    const domain = "test.vendora.local";
    const results = await Promise.all(
      Array.from({ length: 20 }, () => resolveTenant(prisma, domain))
    );

    expect(tenantFindUniqueCalls).toBe(1);
    expect(results.every((r) => r && r.tenant.id === "t-sub")).toBe(true);
  });

  it("dedupes L1+L2 MISS under concurrency for custom domains", async () => {
    process.env.CUSTOM_DOMAINS_ENABLED = "true";

    let customDomainFindCalls = 0;
    let tenantFindByIdCalls = 0;

    const prisma: any = {
      customDomain: {
        findFirst: vi.fn(async () => {
          customDomainFindCalls += 1;
          await delay(50);
          return { tenantId: "t-custom", domain: "example.com", status: "VERIFIED" };
        }),
      },
      tenant: {
        findUnique: vi.fn(async ({ where }: any) => {
          // this path is only for L2 miss by tenantId
          if (where?.id !== "t-custom") return null;
          tenantFindByIdCalls += 1;
          await delay(50);
          return makeTenantRow({
            id: "t-custom",
            slug: "tenant-custom",
            customDomains: [{ domain: "example.com", status: "VERIFIED" }],
          });
        }),
      },
    };

    const results = await Promise.all(
      Array.from({ length: 20 }, () => resolveTenant(prisma, "example.com"))
    );

    expect(customDomainFindCalls).toBe(1);
    expect(tenantFindByIdCalls).toBe(1);
    expect(results.every((r) => r && r.tenant.id === "t-custom")).toBe(true);
  });

  it("cleans inflight state on error (subsequent calls retry)", async () => {
    let calls = 0;
    const prisma: any = {
      tenant: {
        findUnique: vi.fn(async () => {
          calls += 1;
          await delay(20);
          if (calls === 1) throw new Error("boom");
          return makeTenantRow({ id: "t-ok", slug: "test" });
        }),
      },
      customDomain: {
        findFirst: vi.fn(async () => null),
      },
    };

    await expect(resolveTenant(prisma, "test.vendora.local")).rejects.toThrow("boom");
    const ok = await resolveTenant(prisma, "test.vendora.local");

    expect(calls).toBe(2);
    expect(ok?.tenant.id).toBe("t-ok");
  });
});

