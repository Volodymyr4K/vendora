
import "fastify";

declare module "fastify" {
    interface FastifyRequest {
        id: string;
        tenantId: string;
        // user, tenant, adminContext: declared in types/fastify.ts
        customer?: {
            id: string;
            phone: string;
            tenantId: string;
        };
    }
}

declare module "@fastify/jwt" {
    interface FastifyJWT {
        payload: {
            role: string;
            userId: string;
            username?: string;
            tenantId?: string;
            activeTenantId?: string;
            permissions?: Record<string, { canView: boolean; canEdit: boolean; allowedBranchIds: string[] | null }>;
        };
    }
}
