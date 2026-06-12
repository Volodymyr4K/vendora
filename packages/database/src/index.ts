import { PrismaClient } from "@prisma/client";

export * from "@prisma/client";
// Force TS Refresh: 2026-01-13

const globalLike = global as unknown;
const globalForPrisma = globalLike as unknown as { prisma: PrismaClient };

/**
 * Build safe database URL with query timeout
 * Uses URL parsing to safely append query parameters
 */
function buildDatabaseUrl(): string {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
        throw new Error('DATABASE_URL is required');
    }

    try {
        const url = new URL(baseUrl);
        // Add statement timeout (5 seconds) to prevent long-running queries
        url.searchParams.set('statement_timeout', '5000');
        return url.toString();
    } catch (error) {
        // Fallback if URL parsing fails (shouldn't happen with valid DATABASE_URL)
        // eslint-disable-next-line no-console
        console.warn('[PRISMA] Failed to parse DATABASE_URL, using as-is:', error);
        return baseUrl;
    }
}

export const prisma =
    globalForPrisma.prisma ||
    new PrismaClient({
        // Environment-aware logging:
        // - Production: Only errors (avoid log flooding)
        // - Development: Full visibility (query, info, warn, error)
        log: process.env.NODE_ENV === 'production'
            ? ['error']
            : ['query', 'info', 'warn', 'error'],

        // Add query timeout to prevent database connection exhaustion
        datasources: {
            db: {
                url: buildDatabaseUrl()
            }
        }
    });

// Cache singleton in development to survive hot reloads
if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = prisma;
}

// Note: We do not use $on('beforeExit') here because it is not supported in Prisma Library Engine (default in 5.x+).
// Connection management is handled by the application's graceful shutdown logic (see apps/bff/src/index.ts).
