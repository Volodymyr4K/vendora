import type { FastifyInstance, FastifyRequest } from "fastify";
import { getOrSet } from "../../../cache/stale.js";
import { z } from "zod";
import { DeliveryResponse, zDeliveryResponse } from "@vendora/contracts";
import { moneyFromMinor } from "../../../utils/money.js";
import { requireStorefrontFeature } from "../../../lib/feature-guard.js";
import { zFeatureDisabledResponse } from "../../../schemas/storefront-errors.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";

class BranchNotFoundError extends Error { }

export async function routesDelivery(
  app: FastifyInstance,
  deps: RoutesDependencies
) {
  app.get("/delivery/:branch", {
    schema: {
      params: z.object({ branch: z.string() }),
      response: {
        200: zDeliveryResponse,
        400: z.object({ error: z.string() }),
        403: zFeatureDisabledResponse,
        404: z.object({ error: z.string() })
      }
    }
  },
    async (req: FastifyRequest<{ Params: { branch: string } }>, reply) => {
      const slug = req.params.branch;

      // CRITICAL: Tenant context is REQUIRED for cache isolation
      const tenantId = req.tenant?.id;
      if (!tenantId) {
        return reply.code(400).send({ error: "Tenant context required" });
      }
      if (!requireStorefrontFeature(req, reply, "basicDelivery", "delivery")) return;

      // TENANT-SCOPED cache key
      const key = `tenant:${tenantId}:delivery:${slug}`;

      try {
        const r = await getOrSet(
          deps.cache,
          key,
          deps.ttlSec,
          deps.staleSec,
          async (): Promise<DeliveryResponse> => {
            const branch = await deps.prisma.branch.findFirst({
              where: {
                slug,
                tenantId // SECURITY: Enforce tenant isolation
              }
            });
            if (!branch) {
              throw new BranchNotFoundError();
            }

            if (!branch.isActive) {
              return { mode: "fallback", message: "The venue is temporarily closed." };
            }

            return {
              mode: "ok",
              cfg: {
                deliveryFee: moneyFromMinor(branch.deliveryFee),
                freeFrom: moneyFromMinor(branch.freeFrom),
                etaMin: branch.etaMin,
                etaMax: branch.etaMax,
                zones: branch.zones,
              }
            };
          },
          { swr: deps.swr, onRevalidateError: (e) => app.log.warn({ err: e }, "delivery revalidate failed") }
        );
        deps.metrics?.cacheResult.inc({ key, result: r.from });

        reply.header("x-cache", r.from);
        reply.header("x-cache-age", String(Math.floor(r.ageSec)));
        return r.data;
      } catch (err) {
        if (err instanceof BranchNotFoundError) {
          return reply.code(404).send({ error: "Branch not found" });
        }
        throw err;
      }
    });
}
