/**
 * ACCESS_LEVELS Phase 3: Reason enum for guard deny-by-default logging.
 * Set by the first failing check in order; CAPABILITY_DENIED only for TENANT_ADMIN (owner skips capability).
 * Phase 3.5: BRANCH_DENIED when branchScoped route and branchId not in allowedBranchIds (or allowedBranchIds === []).
 */

export const AdminGuardDenialReason = {
    NO_CONTEXT: "NO_CONTEXT",
    NO_REGISTRY_ENTRY: "NO_REGISTRY_ENTRY",
    MODULE_DISABLED: "MODULE_DISABLED",
    OWNER_ONLY_DENIED: "OWNER_ONLY_DENIED",
    PERMISSION_DENIED: "PERMISSION_DENIED",
    CAPABILITY_DENIED: "CAPABILITY_DENIED",
    BRANCH_DENIED: "BRANCH_DENIED",
} as const;

export type AdminGuardDenialReasonType =
    (typeof AdminGuardDenialReason)[keyof typeof AdminGuardDenialReason];
