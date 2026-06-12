import type { FastifyReply, FastifyRequest } from "fastify";
import type { TenantFeatures } from "@vendora/contracts";
import { FEATURE_DISABLED_BODY } from "../schemas/storefront-errors.js";

/**
 * Check if a storefront feature is enabled (granular → master → default).
 * Only use when req.tenant.features is set (tenant-context already returns 503 for null).
 * Default (true) applies only when features exists and the field is missing.
 */
export function isStorefrontFeatureEnabled(
    features: TenantFeatures,
    granular: keyof TenantFeatures["modules"],
    master?: "profile" | "ordering" | "delivery"
): boolean {
    const m = features?.modules;
    if (!m) return true;
    const g = m[granular];
    if (g !== undefined && g !== null) return g;
    if (master) {
        const ma = m[master];
        if (ma !== undefined && ma !== null) return ma;
    }
    return true;
}

const INTERNAL_MISCONFIG_BODY = {
    error: "Server configuration error: tenant features not available",
    code: "INTERNAL_MISCONFIG" as const
};

const TENANT_NOT_CONFIGURED_BODY = {
    error: "Tenant not configured",
    code: "TENANT_NOT_CONFIGURED" as const
};

/**
 * Guard: if feature is disabled, send 403 and return false; otherwise return true.
 * When features is null → 503 TENANT_NOT_CONFIGURED (aligned with tenant-context; in practice tenant-context
 * returns 503 before routes run, so null should not reach the guard).
 * When features is undefined → 500 INTERNAL_MISCONFIG (invariant broken).
 * Call after validateTenant; order per audit: auth → feature.
 */
export function requireStorefrontFeature(
    req: FastifyRequest,
    reply: FastifyReply,
    granular: keyof TenantFeatures["modules"],
    master?: "profile" | "ordering" | "delivery"
): boolean {
    const features = req.tenant?.features;
    if (features === null) {
        void reply.code(503).send(TENANT_NOT_CONFIGURED_BODY);
        return false;
    }
    if (features === undefined) {
        void reply.code(500).send(INTERNAL_MISCONFIG_BODY);
        return false;
    }
    if (isStorefrontFeatureEnabled(features, granular, master)) return true;
    void reply.code(403).send(FEATURE_DISABLED_BODY);
    return false;
}
