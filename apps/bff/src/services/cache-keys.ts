export const CacheKeys = {
    // Public Menu: tenant:{id}:branch:{slug}:menu
    menu: (tenantId: string, branchSlug: string, locale?: string) =>
        `tenant:${tenantId}:branch:${branchSlug}:menu${locale ? `:locale:${locale}` : ""}`,
    // Public Menu Items (no categories): tenant:{id}:branch:{slug}:menu-items
    menuItems: (tenantId: string, branchSlug: string, locale?: string) =>
        `tenant:${tenantId}:branch:${branchSlug}:menu-items${locale ? `:locale:${locale}` : ""}`,

    // Public Branch Info: tenant:{id}:branch:{slug}:settings
    branchSettings: (tenantId: string, branchSlug: string) => `tenant:${tenantId}:branch:${branchSlug}:settings`,

    // Pattern to match all menus for a tenant (used for invalidation)
    // "tenant:{id}:branch:*:menu"
    menuPattern: (tenantId: string) => `tenant:${tenantId}:branch:*:menu*`
};
