import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { RoutesDependencies } from "../../types/dependencies.js";

import { dashboardRoutes } from "./dashboard/dashboard.routes.js";
import { orderRoutes } from "./orders/orders.routes.js";
import { productsRoutes } from "./catalog/products.routes.js";
import { categoriesRoutes } from "./catalog/categories.routes.js";
import { menuRoutes } from "./catalog/menu.routes.js";
import { nutritionRoutes } from "./catalog/nutrition.routes.js";
import { allergensRoutes } from "./catalog/allergens.routes.js";
import { optionGroupsRoutes } from "./catalog/option-groups.routes.js";
import { offersRoutes } from "./catalog/offers.routes.js";
import { attributeDefinitionsRoutes } from "./catalog/attribute-definitions.routes.js";
import { attributeValuesRoutes } from "./catalog/attribute-values.routes.js";
import { integrationsRoutes } from "./integrations/integrations.routes.js";
import { deliveryConfigRoutes } from "./delivery-config.routes.js";
import { settingsRoutes } from "./settings/settings.routes.js";
import { usersRoutes } from "./users/users.routes.js";
import { branchesRoutes } from "./branches.routes.js";
import { contentRoutes } from "./content/content.routes.js";
import { journalAdminRoutes } from "./journal/journal.routes.js";

export const routesAdmin: FastifyPluginAsyncZod = async (app, opts) => {
    // Cast opts to RoutesDependencies (passed from index.ts)
    const _deps = opts as unknown as RoutesDependencies;

    // SECURITY NOTE: Authentication is already enforced at the scope level in index.ts
    // - tenantScope.addHook("onRequest") verifies JWT
    // - tenantGuardPlugin validates tenant access

    await app.register(dashboardRoutes, opts);
    await app.register(orderRoutes, opts);
    await app.register(productsRoutes, opts);
    await app.register(categoriesRoutes, opts);
    await app.register(menuRoutes, opts);
    await app.register(nutritionRoutes, opts);
    await app.register(allergensRoutes, opts);
    await app.register(optionGroupsRoutes, opts);
    await app.register(offersRoutes, opts);
    await app.register(attributeDefinitionsRoutes, opts);
    await app.register(attributeValuesRoutes, opts);
    await app.register(integrationsRoutes, opts);
    await app.register(deliveryConfigRoutes, opts);
    await app.register(settingsRoutes, opts);
    await app.register(usersRoutes, opts);
    await app.register(branchesRoutes, opts);
    await app.register(contentRoutes, opts);
    await app.register(journalAdminRoutes, opts);
};
