import { BranchesMode } from "@vendora/database";

interface ApplyBranchCreateInvariantsArgs {
    tenantId: string;
    newBranchId: string;
    preBranchCount: number;
    priorBranchesMode: BranchesMode | null;
    updateTenant: (data: { branchesMode?: BranchesMode; defaultBranchId?: string | null }) => Promise<void>;
}

export async function applyBranchCreateInvariants({
    tenantId: _tenantId,
    newBranchId,
    preBranchCount,
    priorBranchesMode,
    updateTenant,
}: ApplyBranchCreateInvariantsArgs): Promise<{ tenantUpdated: boolean }> {
    if (preBranchCount === 0) {
        await updateTenant({
            branchesMode: BranchesMode.SINGLE,
            defaultBranchId: newBranchId,
        });
        return { tenantUpdated: true };
    }

    if (preBranchCount >= 1 && priorBranchesMode === BranchesMode.SINGLE) {
        await updateTenant({
            branchesMode: BranchesMode.MULTI,
        });
        return { tenantUpdated: true };
    }

    return { tenantUpdated: false };
}
