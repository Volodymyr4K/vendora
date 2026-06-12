import 'fastify';
import { JWT } from '@fastify/jwt';
import type { MainTemplateId, ResolvedTheme, TenantFeatures } from '@vendora/contracts';
import type { Buffer } from 'node:buffer';

/** ACCESS_LEVELS Phase 2: normalized module permissions (canEdit ⇒ canView applied once). Phase 3.5: branch scope. */
export interface ModulePermission {
    canView: boolean;
    canEdit: boolean;
    /** null = all branches (scope ALL); string[] = allowed branch IDs (scope BRANCH). */
    allowedBranchIds: string[] | null;
}

/** ACCESS_LEVELS Phase 2: admin context from TenantUser; role/permissions for activeTenantId only */
export interface AdminContext {
    tenantId: string;
    role: 'TENANT_OWNER' | 'TENANT_ADMIN';
    permissions: Record<string, ModulePermission> | null;
}

declare module 'fastify' {
    interface FastifyContextConfig {
        /** Enable raw request body capture in preParsing (required for webhook signature verification). */
        rawBody?: boolean;
        /** Maximum raw body bytes to capture when rawBody is enabled. */
        rawBodyMaxBytes?: number;
    }

    interface FastifyRequest {
        jwt: JWT;
        user: {
            userId: string;
            role: string;
            tenantId?: string;
            username?: string;
            activeTenantId?: string;
            permissions?: Record<string, ModulePermission>;
        };
        tenant?: {
            id: string;
            name: string;
            slug: string;
            isActive: boolean;
            customDomainsEnabled: boolean;
            countryCode?: string;
            currency?: string;
            features?: TenantFeatures | null;
            theme: ResolvedTheme;
            mainTemplate: MainTemplateId;
        };
        /** ACCESS_LEVELS Phase 2: set in admin scope from JWT (role + permissions for activeTenantId) */
        adminContext?: AdminContext;

        /** Raw request body bytes (required for webhook signature verification). */
        rawBody?: Buffer;
    }
}
