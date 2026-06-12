/**
 * Phase 6.1: Integration, IntegrationState, ExternalMapping — admin API.
 * Register/update connection, sync state, external↔internal mapping (with internalId validation).
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { validateInternalId, isAllowedEntityType, EXTERNAL_MAPPING_ENTITY_TYPES } from "../../../services/external-mapping-resolver.js";
import type { AdminDeps } from "../types.js";

/** Provider: strict format to avoid garbage/vector in path (alphanumeric, underscore, hyphen). */
const zProvider = z.string().min(1).max(128).regex(/^[a-z0-9_-]+$/);

const zIntegrationCreate = z.object({
  provider: zProvider,
  credentialsRef: z.string().optional().nullable(),
  status: z.enum(["PENDING", "ACTIVE", "ERROR", "DISABLED"]).optional(),
}).strict();

const zIntegrationUpdate = z.object({
  credentialsRef: z.string().optional().nullable(),
  status: z.enum(["PENDING", "ACTIVE", "ERROR", "DISABLED"]).optional(),
}).strict();

const zStateUpsert = z.object({
  cursor: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

const zMappingCreate = z.object({
  entityType: z.string().min(1),
  externalId: z.string().min(1),
  internalId: z.string().min(1),
}).strict();

export const integrationsRoutes: FastifyPluginAsyncZod = async (app, opts) => {
  const deps = opts as unknown as AdminDeps;

  // List integrations (tenant-scoped)
  app.get("/integrations", async (req) => {
    const list = await deps.prisma.integration.findMany({
      where: { tenantId: req.tenant!.id },
      orderBy: { provider: "asc" },
    });
    return list;
  });

  // Create integration (one per tenantId + provider)
  app.post<{ Body: z.infer<typeof zIntegrationCreate> }>("/integrations", {
    schema: { body: zIntegrationCreate },
  }, async (req, reply) => {
    const body = req.body;
    const tid = req.tenant!.id;
    const existing = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: tid, provider: body.provider } },
    });
    if (existing) {
      return reply.code(409).send({ error: "Integration for this provider already exists" });
    }
    const created = await deps.prisma.integration.create({
      data: {
        tenantId: tid,
        provider: body.provider,
        credentialsRef: body.credentialsRef ?? null,
        status: (body.status as "PENDING" | "ACTIVE" | "ERROR" | "DISABLED") ?? "PENDING",
      },
    });
    return created;
  });

  // Get one integration (by provider)
  app.get<{ Params: { provider: string } }>("/integrations/:provider", {
    schema: { params: z.object({ provider: zProvider }) },
  }, async (req, reply) => {
    const int = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: req.tenant!.id, provider: req.params.provider } },
    });
    if (!int) return reply.code(404).send({ error: "Integration not found" });
    return int;
  });

  // Update integration (by provider)
  app.patch<{ Params: { provider: string }; Body: z.infer<typeof zIntegrationUpdate> }>("/integrations/:provider", {
    schema: { body: zIntegrationUpdate, params: z.object({ provider: zProvider }) },
  }, async (req, reply) => {
    const { provider } = req.params;
    const body = req.body;
    const tid = req.tenant!.id;
    const existing = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: tid, provider } },
    });
    if (!existing) return reply.code(404).send({ error: "Integration not found" });
    const updated = await deps.prisma.integration.update({
      where: { tenantId_provider: { tenantId: tid, provider } },
      data: {
        ...(body.credentialsRef !== undefined && { credentialsRef: body.credentialsRef }),
        ...(body.status !== undefined && { status: body.status }),
      },
    });
    return updated;
  });

  // Delete integration (by provider)
  app.delete<{ Params: { provider: string } }>("/integrations/:provider", {
    schema: { params: z.object({ provider: zProvider }) },
  }, async (req, reply) => {
    const { provider } = req.params;
    const tid = req.tenant!.id;
    const existing = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: tid, provider } },
    });
    if (!existing) return reply.code(404).send({ error: "Integration not found" });
    await deps.prisma.integration.delete({
      where: { tenantId_provider: { tenantId: tid, provider } },
    });
    return { ok: true };
  });

  // Get/upsert IntegrationState (one per tenantId, provider, entityType)
  app.get<{ Params: { provider: string; entityType: string } }>("/integrations/:provider/state/:entityType", {
    schema: { params: z.object({ provider: zProvider, entityType: z.string().min(1).max(64) }) },
  }, async (req, reply) => {
    const { provider, entityType } = req.params;
    if (!isAllowedEntityType(entityType)) {
      return reply.code(400).send({
        error: "Unknown entityType",
        code: "INVALID_ENTITY_TYPE",
        allowed: EXTERNAL_MAPPING_ENTITY_TYPES,
      });
    }
    const tid = req.tenant!.id;
    const state = await deps.prisma.integrationState.findUnique({
      where: { tenantId_provider_entityType: { tenantId: tid, provider, entityType } },
    });
    if (!state) return reply.code(404).send({ error: "State not found" });
    return state;
  });

  app.put<{ Params: { provider: string; entityType: string }; Body: z.infer<typeof zStateUpsert> }>("/integrations/:provider/state/:entityType", {
    schema: { body: zStateUpsert, params: z.object({ provider: zProvider, entityType: z.string().min(1).max(64) }) },
  }, async (req, reply) => {
    const { provider, entityType } = req.params;
    if (!isAllowedEntityType(entityType)) {
      return reply.code(400).send({
        error: "Unknown entityType",
        code: "INVALID_ENTITY_TYPE",
        allowed: EXTERNAL_MAPPING_ENTITY_TYPES,
      });
    }
    const body = req.body;
    const tid = req.tenant!.id;
    const integration = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: tid, provider } },
    });
    if (!integration) return reply.code(404).send({ error: "Integration not found" });
    const cursorJson = body.cursor == null ? undefined : (body.cursor as import("@vendora/database").Prisma.InputJsonValue);
    const state = await deps.prisma.integrationState.upsert({
      where: { tenantId_provider_entityType: { tenantId: tid, provider, entityType } },
      create: { tenantId: tid, provider, entityType, cursor: cursorJson },
      update: { cursor: cursorJson },
    });
    return state;
  });

  // List mappings (optional filters: entityType, externalId, internalId)
  app.get<{ Params: { provider: string }; Querystring: { entityType?: string; externalId?: string; internalId?: string } }>("/integrations/:provider/mappings", {
    schema: { params: z.object({ provider: zProvider }) },
  }, async (req, reply) => {
    const { provider } = req.params;
    const { entityType, externalId, internalId } = req.query;
    if (entityType !== undefined && entityType !== "" && !isAllowedEntityType(entityType)) {
      return reply.code(400).send({
        error: "Unknown entityType",
        code: "INVALID_ENTITY_TYPE",
        allowed: EXTERNAL_MAPPING_ENTITY_TYPES,
      });
    }
    const tid = req.tenant!.id;
    const integration = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: tid, provider } },
    });
    if (!integration) return reply.code(404).send({ error: "Integration not found" });
    const list = await deps.prisma.externalMapping.findMany({
      where: {
        tenantId: tid,
        provider,
        ...(entityType && { entityType }),
        ...(externalId && { externalId }),
        ...(internalId && { internalId }),
      },
      orderBy: [{ entityType: "asc" }, { externalId: "asc" }],
    });
    return list;
  });

  // Create mapping (validate entityType whitelist and internalId belongs to tenant)
  app.post<{ Params: { provider: string }; Body: z.infer<typeof zMappingCreate> }>("/integrations/:provider/mappings", {
    schema: { body: zMappingCreate, params: z.object({ provider: zProvider }) },
  }, async (req, reply) => {
    const { provider } = req.params;
    const body = req.body;
    const tid = req.tenant!.id;
    if (!isAllowedEntityType(body.entityType)) {
      return reply.code(400).send({
        error: "Unknown entityType",
        code: "INVALID_ENTITY_TYPE",
        allowed: EXTERNAL_MAPPING_ENTITY_TYPES,
      });
    }
    const valid = await validateInternalId(deps.prisma, tid, body.entityType, body.internalId);
    if (!valid) {
      return reply.code(404).send({
        error: "internalId not found or does not belong to tenant",
        code: "INVALID_INTERNAL_ID",
      });
    }
    const integration = await deps.prisma.integration.findUnique({
      where: { tenantId_provider: { tenantId: tid, provider } },
    });
    if (!integration) return reply.code(404).send({ error: "Integration not found" });
    try {
      const created = await deps.prisma.externalMapping.create({
        data: {
          tenantId: tid,
          provider,
          entityType: body.entityType,
          externalId: body.externalId,
          internalId: body.internalId,
        },
      });
      return created;
    } catch (e: unknown) {
      if (e && typeof e === "object" && "code" in e && e.code === "P2002") {
        return reply.code(409).send({ error: "Mapping already exists for this externalId or internalId" });
      }
      throw e;
    }
  });

  // Delete mapping by (entityType, externalId)
  app.delete<{ Params: { provider: string; entityType: string; externalId: string } }>("/integrations/:provider/mappings/:entityType/:externalId", {
    schema: { params: z.object({ provider: zProvider, entityType: z.string().min(1).max(64), externalId: z.string().min(1) }) },
  }, async (req, reply) => {
    const { provider, entityType, externalId } = req.params;
    if (!isAllowedEntityType(entityType)) {
      return reply.code(400).send({
        error: "Unknown entityType",
        code: "INVALID_ENTITY_TYPE",
        allowed: EXTERNAL_MAPPING_ENTITY_TYPES,
      });
    }
    const tid = req.tenant!.id;
    const existing = await deps.prisma.externalMapping.findUnique({
      where: { tenantId_provider_entityType_externalId: { tenantId: tid, provider, entityType, externalId } },
    });
    if (!existing) return reply.code(404).send({ error: "Mapping not found" });
    await deps.prisma.externalMapping.delete({
      where: { tenantId_provider_entityType_externalId: { tenantId: tid, provider, entityType, externalId } },
    });
    return { ok: true };
  });
};
