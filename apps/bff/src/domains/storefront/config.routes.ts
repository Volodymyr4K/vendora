import type { FastifyInstance } from "fastify";
import { validateTenant } from "../../plugins/tenant-guard.js";
import { z } from "zod";
import { zStorefrontConfig, DEFAULT_TENANT_FEATURES, type TenantFeatures, zAmContentV1 } from "@vendora/contracts";

export async function routesStorefrontConfig(app: FastifyInstance) {
    // GET /config — storefront public config (no limits/integrations/capabilities)
    app.get("/", {
        schema: {
            summary: "Get Public Tenant Configuration",
            tags: ["Storefront"],
            response: {
                200: zStorefrontConfig,
                503: z.object({ error: z.string(), code: z.literal("TENANT_NOT_CONFIGURED") })
            }
        }
    }, async (req, reply) => {
        const tenant = validateTenant(req);

        if (tenant.features === null) {
            reply.header("Cache-Control", "private, no-store");
            return reply.code(503).send({
                error: "Tenant not configured",
                code: "TENANT_NOT_CONFIGURED"
            });
        }

        reply.header("Cache-Control", "private, no-store");

        const f = (tenant.features as TenantFeatures | undefined) ?? DEFAULT_TENANT_FEATURES;
        const parsedAmContent = zAmContentV1.safeParse(tenant.amContent);
        return {
            countryCode: tenant.countryCode || "UA",
            currency: tenant.currency || "UAH",
            name: tenant.name,
            features: { version: f.version, modules: f.modules },
            theme: tenant.theme,
            mainTemplate: tenant.mainTemplate,
            ...(tenant.mainTemplate === "berlin-press" && parsedAmContent.success
                ? { amContent: parsedAmContent.data }
                : {}),
        };
    });
}
