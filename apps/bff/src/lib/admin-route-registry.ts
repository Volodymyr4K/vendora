/**
 * ACCESS_LEVELS Phase 1.5: Admin route registry (SSOT for endpoint → module + action).
 * Every /admin/* route must have an entry here; CI fails if a route is missing.
 * Types use canonical ADMIN_MODULE_IDS from contracts.
 */

import { BRANCH_SCOPED_ADMIN_MODULE_IDS, type AdminModuleId } from "@vendora/contracts";

export type AdminRouteAction = "read" | "write";

export interface AdminRouteEntry {
    /** Normalized: METHOD + path with :param tokens (e.g. "GET /:branch/stats") */
    routeId: string;
    moduleId: AdminModuleId;
    action: AdminRouteAction;
    ownerOnly?: boolean;
    capabilityId?: string;
    /** If true, guard also checks user has this capability */
    requiresCapability?: boolean;
    /** ACCESS_LEVELS Phase 3.5: if true, guard checks branchId against allowedBranchIds from DB (not JWT). */
    branchScoped?: boolean;
}

/** Registry: routeId → entry. Phase 3: all /admin/* routes; deny-by-default. Phase 3.5: branchScoped for :branch routes. */
export const ADMIN_ROUTE_REGISTRY: AdminRouteEntry[] = [
    // dashboard (GET /me is whitelisted in guard — not tied to any module)
    { routeId: "GET /:branch/stats", moduleId: "admin_dashboard", action: "read", branchScoped: true },
    // orders
    { routeId: "GET /:branch/orders", moduleId: "admin_orders", action: "read", branchScoped: true },
    { routeId: "PATCH /:branch/orders/:id/status", moduleId: "admin_orders", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/orders/:id/reschedule", moduleId: "admin_orders", action: "write", branchScoped: true },
    // catalog: menu, categories
    { routeId: "GET /:branch/categories", moduleId: "admin_catalog_categories", action: "read", branchScoped: true },
    { routeId: "GET /:branch/menu", moduleId: "admin_catalog_menu", action: "read", branchScoped: true },
    { routeId: "POST /:branch/categories", moduleId: "admin_catalog_categories", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/categories/:id", moduleId: "admin_catalog_categories", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/categories/:id/toggle-availability", moduleId: "admin_catalog_categories", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/categories/reorder", moduleId: "admin_catalog_categories", action: "write", branchScoped: true },
    { routeId: "DELETE /:branch/categories/:id", moduleId: "admin_catalog_categories", action: "write", branchScoped: true },
    // catalog: products
    { routeId: "POST /:branch/products", moduleId: "admin_catalog_products", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/products/:id", moduleId: "admin_catalog_products", action: "write", branchScoped: true },
    { routeId: "DELETE /:branch/products/:id", moduleId: "admin_catalog_products", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/products/:id/toggle-availability", moduleId: "admin_catalog_products", action: "write", branchScoped: true },
    // catalog: nutrition, allergens
    { routeId: "GET /:branch/catalog-items/:id/nutrition", moduleId: "admin_catalog_nutrition", action: "read", branchScoped: true },
    { routeId: "PUT /:branch/catalog-items/:id/nutrition", moduleId: "admin_catalog_nutrition", action: "write", branchScoped: true },
    { routeId: "GET /:branch/catalog-items/:id/allergens", moduleId: "admin_catalog_allergens", action: "read", branchScoped: true },
    { routeId: "PUT /:branch/catalog-items/:id/allergens", moduleId: "admin_catalog_allergens", action: "write", branchScoped: true },
    // catalog: option-groups, offers
    { routeId: "GET /:branch/option-groups", moduleId: "admin_catalog_option_groups", action: "read", branchScoped: true },
    { routeId: "POST /:branch/option-groups", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/option-groups/:id", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "DELETE /:branch/option-groups/:id", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "GET /:branch/option-groups/:id/options", moduleId: "admin_catalog_option_groups", action: "read", branchScoped: true },
    { routeId: "POST /:branch/option-groups/:id/options", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "PATCH /:branch/option-groups/:id/options/:id", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "DELETE /:branch/option-groups/:id/options/:id", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "POST /:branch/catalog-items/:id/option-groups", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "DELETE /:branch/catalog-items/:id/option-groups/:id", moduleId: "admin_catalog_option_groups", action: "write", branchScoped: true },
    { routeId: "GET /:branch/offers", moduleId: "admin_catalog_offers", action: "read", branchScoped: true },
    { routeId: "POST /:branch/offers", moduleId: "admin_catalog_offers", action: "write", branchScoped: true },
    { routeId: "GET /:branch/offers/:id", moduleId: "admin_catalog_offers", action: "read", branchScoped: true },
    { routeId: "PATCH /:branch/offers/:id", moduleId: "admin_catalog_offers", action: "write", branchScoped: true },
    { routeId: "DELETE /:branch/offers/:id", moduleId: "admin_catalog_offers", action: "write", branchScoped: true },
    // catalog: attribute-definitions, attribute-values (no :branch in path)
    { routeId: "GET /attribute-definitions", moduleId: "admin_catalog_attribute_definitions", action: "read" },
    { routeId: "POST /attribute-definitions", moduleId: "admin_catalog_attribute_definitions", action: "write" },
    { routeId: "GET /attribute-definitions/:id", moduleId: "admin_catalog_attribute_definitions", action: "read" },
    { routeId: "PATCH /attribute-definitions/:id", moduleId: "admin_catalog_attribute_definitions", action: "write" },
    { routeId: "DELETE /attribute-definitions/:id", moduleId: "admin_catalog_attribute_definitions", action: "write" },
    { routeId: "GET /attribute-values", moduleId: "admin_catalog_attribute_values", action: "read" },
    { routeId: "POST /attribute-values", moduleId: "admin_catalog_attribute_values", action: "write" },
    { routeId: "GET /attribute-values/:id", moduleId: "admin_catalog_attribute_values", action: "read" },
    { routeId: "PATCH /attribute-values/:id", moduleId: "admin_catalog_attribute_values", action: "write" },
    { routeId: "DELETE /attribute-values/:id", moduleId: "admin_catalog_attribute_values", action: "write" },
    // integrations
    { routeId: "GET /integrations", moduleId: "admin_integrations", action: "read" },
    { routeId: "POST /integrations", moduleId: "admin_integrations", action: "write" },
    { routeId: "GET /integrations/:provider", moduleId: "admin_integrations", action: "read" },
    { routeId: "PATCH /integrations/:provider", moduleId: "admin_integrations", action: "write" },
    { routeId: "DELETE /integrations/:provider", moduleId: "admin_integrations", action: "write" },
    { routeId: "GET /integrations/:provider/state/:entityType", moduleId: "admin_integrations", action: "read" },
    { routeId: "PUT /integrations/:provider/state/:entityType", moduleId: "admin_integrations", action: "write" },
    { routeId: "GET /integrations/:provider/mappings", moduleId: "admin_integrations", action: "read" },
    { routeId: "POST /integrations/:provider/mappings", moduleId: "admin_integrations", action: "write" },
    { routeId: "DELETE /integrations/:provider/mappings/:entityType/:id", moduleId: "admin_integrations", action: "write" },
    // delivery-config, settings
    { routeId: "GET /:branch/delivery-config", moduleId: "admin_delivery_config", action: "read", branchScoped: true },
    { routeId: "PUT /:branch/delivery-config", moduleId: "admin_delivery_config", action: "write", branchScoped: true },
    { routeId: "GET /:branch/settings", moduleId: "admin_settings", action: "read", branchScoped: true },
    { routeId: "PATCH /:branch/settings", moduleId: "admin_settings", action: "write", branchScoped: true },
    // media uploads
    { routeId: "POST /upload", moduleId: "admin_media", action: "write" },
    // Backward-compat alias (was /admin/admin/upload at runtime)
    { routeId: "POST /admin/upload", moduleId: "admin_media", action: "write" },
    // content (tenant-level)
    { routeId: "GET /content", moduleId: "admin_content", action: "read" },
    { routeId: "PATCH /content", moduleId: "admin_content", action: "write" },
    // journal (tenant-level; v1 under admin_content module)
    { routeId: "GET /journal", moduleId: "admin_content", action: "read" },
    { routeId: "GET /journal/:id", moduleId: "admin_content", action: "read" },
    { routeId: "POST /journal", moduleId: "admin_content", action: "write" },
    { routeId: "PATCH /journal/:id", moduleId: "admin_content", action: "write" },
    { routeId: "DELETE /journal/:id", moduleId: "admin_content", action: "write" },
    { routeId: "POST /journal/:id/publish", moduleId: "admin_content", action: "write" },
    { routeId: "POST /journal/:id/unpublish", moduleId: "admin_content", action: "write" },
    { routeId: "PUT /journal/:id/home-slot", moduleId: "admin_content", action: "write" },
    // ACCESS_LEVELS Phase 5: tenant users (owner only)
    { routeId: "GET /branches", moduleId: "admin_users", action: "read", ownerOnly: true },
    { routeId: "GET /users", moduleId: "admin_users", action: "read", ownerOnly: true },
    { routeId: "POST /users", moduleId: "admin_users", action: "write", ownerOnly: true },
    { routeId: "PATCH /users/:id", moduleId: "admin_users", action: "write", ownerOnly: true },
    { routeId: "DELETE /users/:id", moduleId: "admin_users", action: "write", ownerOnly: true },
];

/** Set of routeIds in registry (for quick lookup). */
export const ADMIN_ROUTE_IDS = new Set(ADMIN_ROUTE_REGISTRY.map((e) => e.routeId));

/** Phase 3.5: allowlist from contracts (SSOT); used for branch-scope validation in users API and guard. */
export const BRANCH_SCOPED_MODULE_IDS = new Set<string>(BRANCH_SCOPED_ADMIN_MODULE_IDS);

/**
 * List of routeIds that MUST have an entry in ADMIN_ROUTE_REGISTRY.
 * When adding a new /admin/* route, add its routeId here and add an entry to ADMIN_ROUTE_REGISTRY;
 * otherwise CI (admin-route-coverage test) fails.
 */
export const REQUIRED_ADMIN_ROUTE_IDS: string[] = ADMIN_ROUTE_REGISTRY.map((e) => e.routeId);

export function getAdminRouteEntry(routeId: string): AdminRouteEntry | undefined {
    return ADMIN_ROUTE_REGISTRY.find((e) => e.routeId === routeId);
}
