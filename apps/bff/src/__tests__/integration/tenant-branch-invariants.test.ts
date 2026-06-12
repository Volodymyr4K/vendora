import { describe, it, expect, vi } from "vitest";
import { applyBranchCreateInvariants } from "../../services/tenant-branch-invariants.js";
import { BranchesMode } from "@vendora/database";

describe("tenant-branch invariants", () => {
    it("sets SINGLE + defaultBranchId when first branch is created", async () => {
        const updateTenant = vi.fn().mockResolvedValue(undefined);

        const result = await applyBranchCreateInvariants({
            tenantId: "tenant-1",
            newBranchId: "branch-1",
            preBranchCount: 0,
            priorBranchesMode: BranchesMode.MULTI,
            updateTenant,
        });

        expect(result.tenantUpdated).toBe(true);
        expect(updateTenant).toHaveBeenCalledWith({
            branchesMode: BranchesMode.SINGLE,
            defaultBranchId: "branch-1",
        });
    });

    it("transitions SINGLE to MULTI when adding second branch", async () => {
        const updateTenant = vi.fn().mockResolvedValue(undefined);

        const result = await applyBranchCreateInvariants({
            tenantId: "tenant-2",
            newBranchId: "branch-2",
            preBranchCount: 1,
            priorBranchesMode: BranchesMode.SINGLE,
            updateTenant,
        });

        expect(result.tenantUpdated).toBe(true);
        expect(updateTenant).toHaveBeenCalledWith({
            branchesMode: BranchesMode.MULTI,
        });
    });

    it("does not downgrade MULTI to SINGLE when only one branch exists", async () => {
        const updateTenant = vi.fn().mockResolvedValue(undefined);

        const result = await applyBranchCreateInvariants({
            tenantId: "tenant-3",
            newBranchId: "branch-3",
            preBranchCount: 1,
            priorBranchesMode: BranchesMode.MULTI,
            updateTenant,
        });

        expect(result.tenantUpdated).toBe(false);
        expect(updateTenant).not.toHaveBeenCalled();
    });
});
