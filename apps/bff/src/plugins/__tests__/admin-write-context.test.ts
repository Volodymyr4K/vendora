/**
 * ACCESS_LEVELS: DB-check on write — tests for adminWriteContextPlugin.
 * Verifies: (1) DB-refresh uses req.user.tenantId (JWT), not header/body;
 * (2) when loadTenantAdminContext returns null → 403; (3) when fresh context returned → req.adminContext set.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { FastifyRequest, FastifyReply, FastifyInstance } from "fastify";
import { adminWriteContextPlugin } from "../admin-write-context.js";
import * as adminContext from "../../lib/admin-context.js";

vi.mock("../../lib/admin-context", () => ({
    loadTenantAdminContext: vi.fn(),
}));

const loadTenantAdminContext = vi.mocked(adminContext.loadTenantAdminContext);

function createMockRequest(overrides: Partial<{
    method: string;
    user: { tenantId?: string; userId?: string };
    tenant: { id: string };
}>): Partial<FastifyRequest> {
    return {
        method: "GET",
        user: undefined,
        tenant: undefined,
        ...overrides,
    } as Partial<FastifyRequest>;
}

function createMockReply(): FastifyReply {
    return {
        code: vi.fn().mockReturnThis(),
        send: vi.fn().mockReturnThis(),
    } as unknown as FastifyReply;
}

describe("adminWriteContextPlugin", () => {
    let mockApp: FastifyInstance;
    let onRequestHook: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

    beforeEach(async () => {
        vi.clearAllMocks();
        mockApp = {
            addHook: vi.fn((name: string, fn: (req: FastifyRequest, reply: FastifyReply) => Promise<void>) => {
                if (name === "onRequest") onRequestHook = fn;
            }),
        } as unknown as FastifyInstance;
        await adminWriteContextPlugin(mockApp, { prisma: {} as Parameters<typeof adminWriteContextPlugin>[1]["prisma"] });
    });

    it("does nothing for GET (no DB call, no 403)", async () => {
        const req = createMockRequest({ method: "GET" }) as FastifyRequest;
        const reply = createMockReply();
        await onRequestHook(req, reply);
        expect(loadTenantAdminContext).not.toHaveBeenCalled();
        expect(reply.code).not.toHaveBeenCalled();
    });

    it("returns 403 when req.user.tenantId or userId missing on write", async () => {
        const req = createMockRequest({ method: "PATCH", user: {} }) as FastifyRequest;
        const reply = createMockReply();
        await onRequestHook(req, reply);
        expect(loadTenantAdminContext).not.toHaveBeenCalled();
        expect(reply.code).toHaveBeenCalledWith(403);
    });

    it("returns 403 when loadTenantAdminContext returns null (no membership)", async () => {
        loadTenantAdminContext.mockResolvedValue(null);
        const tenantId = "tid";
        const userId = "uid";
        const req = createMockRequest({
            method: "PATCH",
            user: { tenantId, userId },
            tenant: { id: "other-tenant-id" },
        }) as FastifyRequest;
        const reply = createMockReply();
        await onRequestHook(req, reply);
        expect(loadTenantAdminContext).toHaveBeenCalledWith(expect.anything(), tenantId, userId);
        expect(loadTenantAdminContext).not.toHaveBeenCalledWith(expect.anything(), "other-tenant-id", userId);
        expect(reply.code).toHaveBeenCalledWith(403);
    });

    it("uses req.user.tenantId (JWT) for DB load, not req.tenant.id", async () => {
        loadTenantAdminContext.mockResolvedValue({ role: "TENANT_OWNER", permissions: null });
        const jwtTenantId = "jwt-tenant-id";
        const headerTenantId = "header-tenant-id";
        const userId = "uid";
        const req = createMockRequest({
            method: "POST",
            user: { tenantId: jwtTenantId, userId },
            tenant: { id: headerTenantId },
        }) as FastifyRequest;
        const reply = createMockReply();
        await onRequestHook(req, reply);
        expect(loadTenantAdminContext).toHaveBeenCalledWith(expect.anything(), jwtTenantId, userId);
        expect(loadTenantAdminContext).not.toHaveBeenCalledWith(expect.anything(), headerTenantId, userId);
    });

    it("sets req.adminContext when loadTenantAdminContext returns fresh context", async () => {
        const fresh = {
            role: "TENANT_ADMIN" as const,
            permissions: { admin_orders: { canView: true, canEdit: true, allowedBranchIds: null } },
        };
        loadTenantAdminContext.mockResolvedValue(fresh);
        const tenantId = "tid";
        const userId = "uid";
        const req = createMockRequest({ method: "PATCH", user: { tenantId, userId } }) as FastifyRequest;
        const reply = createMockReply();
        await onRequestHook(req, reply);
        expect(req.adminContext).toEqual({
            tenantId,
            role: fresh.role,
            permissions: fresh.permissions,
        });
        expect(reply.code).not.toHaveBeenCalled();
    });
});
