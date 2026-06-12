import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import Fastify, { FastifyInstance } from "fastify";
import internalRoutes from "../internal.routes.js";

vi.mock("../../../services/tenant-resolver", () => ({
    resolveTenant: vi.fn(),
}));

vi.mock("../../../lib/internal-auth", () => ({
    isValidInternalSecret: () => true,
}));

describe("GET /internal/resolve-tenant", () => {
    let app: FastifyInstance;

    beforeAll(async () => {
        app = Fastify({ logger: false });
        await app.register(internalRoutes);
        await app.ready();
    });

    afterAll(async () => {
        await app.close();
    });

    it("returns mode=default with branchSlug for SINGLE tenant", async () => {
        const { resolveTenant } = await import("../../../services/tenant-resolver.js");
        vi.mocked(resolveTenant).mockResolvedValue({
            tenant: {
                id: "tenant-1",
                slug: "tenant-one",
                name: "Tenant One",
                isActive: true,
                customDomainsEnabled: true,
                branchesMode: "SINGLE",
                defaultBranchId: "branch-1",
                defaultBranch: { slug: "branch-one" },
                countryCode: "UA",
                currency: "UAH",
                timezone: "Europe/Kiev",
                features: {},
                theme: {} as never,
                mainTemplate: "default",
                customDomains: [],
            },
            type: "custom",
        });

        const response = await app.inject({
            method: "GET",
            url: "/internal/resolve-tenant?domain=example.com",
            headers: { "x-internal-secret": "test" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            tenantId: "tenant-1",
            slug: "tenant-one",
            name: "Tenant One",
            type: "custom",
            mode: "default",
            branchSlug: "branch-one",
        });
    });

    it("returns mode=chooser when MULTI and no default branch", async () => {
        const { resolveTenant } = await import("../../../services/tenant-resolver.js");
        vi.mocked(resolveTenant).mockResolvedValue({
            tenant: {
                id: "tenant-2",
                slug: "tenant-two",
                name: "Tenant Two",
                isActive: true,
                customDomainsEnabled: true,
                branchesMode: "MULTI",
                defaultBranchId: null,
                defaultBranch: null,
                countryCode: "UA",
                currency: "UAH",
                timezone: "Europe/Kiev",
                features: {},
                theme: {} as never,
                mainTemplate: "default",
                customDomains: [],
            },
            type: "subdomain",
        });

        const response = await app.inject({
            method: "GET",
            url: "/internal/resolve-tenant?domain=tenant.vendora.local",
            headers: { "x-internal-secret": "test" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            tenantId: "tenant-2",
            slug: "tenant-two",
            name: "Tenant Two",
            type: "subdomain",
            mode: "chooser",
        });
        expect(response.json()).not.toHaveProperty("branchSlug");
    });

    it("returns mode=chooser when SINGLE without default branch (fail-soft)", async () => {
        const { resolveTenant } = await import("../../../services/tenant-resolver.js");
        vi.mocked(resolveTenant).mockResolvedValue({
            tenant: {
                id: "tenant-3",
                slug: "tenant-three",
                name: "Tenant Three",
                isActive: true,
                customDomainsEnabled: true,
                branchesMode: "SINGLE",
                defaultBranchId: null,
                defaultBranch: null,
                countryCode: "UA",
                currency: "UAH",
                timezone: "Europe/Kiev",
                features: {},
                theme: {} as never,
                mainTemplate: "default",
                customDomains: [],
            },
            type: "custom",
        });

        const response = await app.inject({
            method: "GET",
            url: "/internal/resolve-tenant?domain=example.com",
            headers: { "x-internal-secret": "test" },
        });

        expect(response.statusCode).toBe(200);
        expect(response.json()).toMatchObject({
            tenantId: "tenant-3",
            slug: "tenant-three",
            name: "Tenant Three",
            type: "custom",
            mode: "chooser",
        });
        expect(response.json()).not.toHaveProperty("branchSlug");
    });
});
