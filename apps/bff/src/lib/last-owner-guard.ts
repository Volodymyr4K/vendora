/**
 * ACCESS_LEVELS Phase 5: Enforce invariant "tenant has ≥1 owner".
 * Use before changing role TENANT_OWNER → TENANT_ADMIN or deleting a TENANT_OWNER membership.
 */

import type { PrismaClient } from "@vendora/database";
import { TenantUserRole } from "@vendora/database";

export const LAST_OWNER_CODE = "LAST_OWNER";

/**
 * Count TenantUser with role TENANT_OWNER for the given tenant.
 * Optionally exclude one userId (e.g. the member being demoted or removed).
 */
export async function countOwners(
    prisma: PrismaClient,
    tenantId: string,
    excludeUserId?: string
): Promise<number> {
    const where: { tenantId: string; role: typeof TenantUserRole.TENANT_OWNER; userId?: { not: string } } = {
        tenantId,
        role: TenantUserRole.TENANT_OWNER,
    };
    if (excludeUserId) {
        where.userId = { not: excludeUserId };
    }
    return prisma.tenantUser.count({ where });
}

/**
 * Throws an object suitable for 400 reply if after excluding userId there would be zero owners.
 * Call before: (1) PATCH role TENANT_OWNER → TENANT_ADMIN, (2) DELETE TenantUser where role = TENANT_OWNER.
 */
export async function ensureAtLeastOneOwner(
    prisma: PrismaClient,
    tenantId: string,
    excludeUserId: string
): Promise<void> {
    const count = await countOwners(prisma, tenantId, excludeUserId);
    if (count < 1) {
        const err = new Error("Cannot remove the last owner. Tenant must have at least one owner.") as Error & {
            statusCode: number;
            code: string;
        };
        err.statusCode = 400;
        err.code = LAST_OWNER_CODE;
        throw err;
    }
}
