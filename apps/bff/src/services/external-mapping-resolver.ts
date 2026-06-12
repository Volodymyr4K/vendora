/**
 * Phase 6.1: ExternalMapping internalId resolver — single registry entityType → (table, tenantId check).
 * Write-path must validate that internalId exists and belongs to tenantId for the given entityType.
 * Unknown entityType → 4xx. Non-existent or cross-tenant internalId → 4xx.
 */
import type { PrismaClient } from "@vendora/database";

/** Whitelist of allowed entityTypes for ExternalMapping (DoD Phase 6). Unknown → 4xx. */
export const EXTERNAL_MAPPING_ENTITY_TYPES = [
  "catalog_item",
  "order",
  "branch",
  "item_variant",
] as const;

export type ExternalMappingEntityType = (typeof EXTERNAL_MAPPING_ENTITY_TYPES)[number];

export function isAllowedEntityType(value: string): value is ExternalMappingEntityType {
  return (EXTERNAL_MAPPING_ENTITY_TYPES as readonly string[]).includes(value);
}

/**
 * Validates that internalId exists and belongs to tenantId for the given entityType.
 * Returns true if valid; false or throws 4xx from caller if not.
 */
export async function validateInternalId(
  prisma: PrismaClient,
  tenantId: string,
  entityType: string,
  internalId: string
): Promise<boolean> {
  if (!isAllowedEntityType(entityType)) {
    return false;
  }
  switch (entityType) {
    case "catalog_item": {
      const row = await prisma.catalogItem.findFirst({
        where: { id: internalId, tenantId },
        select: { id: true },
      });
      return row !== null;
    }
    case "order": {
      const row = await prisma.order.findFirst({
        where: { id: internalId, tenantId },
        select: { id: true },
      });
      return row !== null;
    }
    case "branch": {
      const row = await prisma.branch.findFirst({
        where: { id: internalId, tenantId },
        select: { id: true },
      });
      return row !== null;
    }
    case "item_variant": {
      const row = await prisma.itemVariant.findFirst({
        where: { id: internalId, tenantId },
        select: { id: true },
      });
      return row !== null;
    }
    default:
      return false;
  }
}
