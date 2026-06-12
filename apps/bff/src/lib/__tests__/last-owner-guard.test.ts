/**
 * ACCESS_LEVELS Phase 5: Unit test for ≥1 owner invariant.
 */

import { describe, it, expect, vi } from "vitest";
import { countOwners, ensureAtLeastOneOwner, LAST_OWNER_CODE } from "../last-owner-guard.js";

describe("last-owner-guard", () => {
    const tenantId = "tenant-1";
    const userId = "user-owner-1";

    it("countOwners returns 0 when no owners", async () => {
        const prisma = {
            tenantUser: { count: vi.fn().mockResolvedValue(0) },
        } as unknown as Parameters<typeof countOwners>[0];
        const n = await countOwners(prisma, tenantId);
        expect(n).toBe(0);
    });

    it("countOwners returns 2 when two owners and excludeUserId removes one", async () => {
        const prisma = {
            tenantUser: { count: vi.fn().mockResolvedValue(2) },
        } as unknown as Parameters<typeof countOwners>[0];
        const n = await countOwners(prisma, tenantId, userId);
        expect(n).toBe(2);
    });

    it("ensureAtLeastOneOwner throws 400 LAST_OWNER when count would be 0", async () => {
        const prisma = {
            tenantUser: { count: vi.fn().mockResolvedValue(0) },
        } as unknown as Parameters<typeof ensureAtLeastOneOwner>[0];
        await expect(ensureAtLeastOneOwner(prisma, tenantId, userId)).rejects.toMatchObject({
            statusCode: 400,
            code: LAST_OWNER_CODE,
        });
    });

    it("ensureAtLeastOneOwner does not throw when count >= 1", async () => {
        const prisma = {
            tenantUser: { count: vi.fn().mockResolvedValue(1) },
        } as unknown as Parameters<typeof ensureAtLeastOneOwner>[0];
        await expect(ensureAtLeastOneOwner(prisma, tenantId, userId)).resolves.toBeUndefined();
    });
});
