/**
 * Internal Domain Types
 * 
 * Service-to-service communication (protected by shared secret)
 */

import type { PrismaClient } from "@vendora/database";

/**
 * Standard dependencies for Internal routes
 * 
 * @property prisma - Database client for tenant resolution
 */
export type InternalDeps = {
    prisma: PrismaClient;
};
