/**
 * Phase 6.2: DeliveryConfigFacet — 1:1 with Branch; optional overlay for delivery/slots.
 * GET/PUT :branchSlug/delivery-config; branch resolved by tenantId + branchSlug.
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AdminDeps } from "./types.js";

const zDeliveryConfigBody = z.object({
  deliveryFee: z.number().int().min(0),
  freeFrom: z.number().int().min(0),
  etaMin: z.number().int().min(0),
  etaMax: z.number().int().min(0),
  zones: z.array(z.string()).default([]),
  minAdvanceMinutes: z.number().int().min(0),
  prepTimeMinutes: z.number().int().min(0),
  slotCapacity: z.number().int().min(0),
}).strict();

export const deliveryConfigRoutes: FastifyPluginAsyncZod = async (app, opts) => {
  const deps = opts as unknown as AdminDeps;

  app.get<{ Params: { branchSlug: string } }>(
    "/:branchSlug/delivery-config",
    { schema: { params: z.object({ branchSlug: z.string().min(1) }) } },
    async (req, reply) => {
      const tid = req.tenant!.id;
      const branch = await deps.prisma.branch.findFirst({
        where: { slug: req.params.branchSlug, tenantId: tid },
        select: { id: true },
      });
      if (!branch) return reply.code(404).send({ error: "Branch not found" });
      const facet = await deps.prisma.deliveryConfigFacet.findUnique({
        where: { tenantId_branchId: { tenantId: tid, branchId: branch.id } },
      });
      if (!facet) return reply.code(404).send({ error: "Delivery config not found" });
      return facet;
    }
  );

  app.put<{ Params: { branchSlug: string }; Body: z.infer<typeof zDeliveryConfigBody> }>(
    "/:branchSlug/delivery-config",
    {
      schema: {
        params: z.object({ branchSlug: z.string().min(1) }),
        body: zDeliveryConfigBody,
      },
    },
    async (req, reply) => {
      const tid = req.tenant!.id;
      const branch = await deps.prisma.branch.findFirst({
        where: { slug: req.params.branchSlug, tenantId: tid },
        select: { id: true },
      });
      if (!branch) return reply.code(404).send({ error: "Branch not found" });
      const body = req.body;
      const facet = await deps.prisma.deliveryConfigFacet.upsert({
        where: { tenantId_branchId: { tenantId: tid, branchId: branch.id } },
        create: {
          tenantId: tid,
          branchId: branch.id,
          deliveryFee: body.deliveryFee,
          freeFrom: body.freeFrom,
          etaMin: body.etaMin,
          etaMax: body.etaMax,
          zones: body.zones,
          minAdvanceMinutes: body.minAdvanceMinutes,
          prepTimeMinutes: body.prepTimeMinutes,
          slotCapacity: body.slotCapacity,
        },
        update: {
          deliveryFee: body.deliveryFee,
          freeFrom: body.freeFrom,
          etaMin: body.etaMin,
          etaMax: body.etaMax,
          zones: body.zones,
          minAdvanceMinutes: body.minAdvanceMinutes,
          prepTimeMinutes: body.prepTimeMinutes,
          slotCapacity: body.slotCapacity,
        },
      });
      return facet;
    }
  );
};
