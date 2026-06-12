/**
 * Phase 5.1: AttributeDefinition — CRUD, tenant-scoped. Custom attribute keys (valueType, appliesToBaseTypes, isFilterable).
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AdminDeps } from "../types.js";

const zAttributeValueType = z.enum(["STRING", "NUMBER", "BOOL", "ENUM", "DATE"]);

const zAttributeDefinitionCreate = z.object({
    key: z.string().min(1),
    label: z.string().min(1),
    valueType: zAttributeValueType,
    appliesToBaseTypes: z.array(z.string()).default([]),
    isFilterable: z.boolean().default(false),
    isSearchable: z.boolean().default(false),
});
const zAttributeDefinitionUpdate = z.object({
    label: z.string().min(1).optional(),
    appliesToBaseTypes: z.array(z.string()).optional(),
    isFilterable: z.boolean().optional(),
    isSearchable: z.boolean().optional(),
}).strict();

export const attributeDefinitionsRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // List definitions (tenant-scoped)
    app.get("/attribute-definitions", async (req) => {
        const list = await deps.prisma.attributeDefinition.findMany({
            where: { tenantId: req.tenant!.id },
            orderBy: { key: "asc" },
        });
        return list;
    });

    // Create definition
    app.post<{ Body: z.infer<typeof zAttributeDefinitionCreate> }>("/attribute-definitions", {
        schema: { body: zAttributeDefinitionCreate },
    }, async (req, reply) => {
        const body = req.body;
        const existing = await deps.prisma.attributeDefinition.findFirst({
            where: { tenantId: req.tenant!.id, key: body.key },
        });
        if (existing) {
            return reply.code(409).send({ error: "Attribute definition with this key already exists" });
        }
        const created = await deps.prisma.attributeDefinition.create({
            data: {
                tenantId: req.tenant!.id,
                key: body.key,
                label: body.label,
                valueType: body.valueType,
                appliesToBaseTypes: body.appliesToBaseTypes,
                isFilterable: body.isFilterable,
                isSearchable: body.isSearchable,
            },
        });
        return created;
    });

    // Get one (tenant-scoped by compound key)
    app.get<{ Params: { id: string } }>("/attribute-definitions/:id", async (req, reply) => {
        const def = await deps.prisma.attributeDefinition.findUnique({
            where: { tenantId_id: { tenantId: req.tenant!.id, id: req.params.id } },
        });
        if (!def) return reply.code(404).send({ error: "Attribute definition not found" });
        return def;
    });

    // Update (tenant-scoped by compound key)
    app.patch<{ Params: { id: string }; Body: z.infer<typeof zAttributeDefinitionUpdate> }>("/attribute-definitions/:id", {
        schema: { body: zAttributeDefinitionUpdate, params: z.object({ id: z.string().uuid() }) },
    }, async (req, reply) => {
        const { id } = req.params;
        const body = req.body;
        const tenantId = req.tenant!.id;
        const existing = await deps.prisma.attributeDefinition.findUnique({
            where: { tenantId_id: { tenantId, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Attribute definition not found" });
        const updated = await deps.prisma.attributeDefinition.update({
            where: { tenantId_id: { tenantId, id } },
            data: {
                ...(body.label !== undefined && { label: body.label }),
                ...(body.appliesToBaseTypes !== undefined && { appliesToBaseTypes: body.appliesToBaseTypes }),
                ...(body.isFilterable !== undefined && { isFilterable: body.isFilterable }),
                ...(body.isSearchable !== undefined && { isSearchable: body.isSearchable }),
            },
        });
        return updated;
    });

    // Delete (tenant-scoped by compound key)
    app.delete<{ Params: { id: string } }>("/attribute-definitions/:id", async (req, reply) => {
        const { id } = req.params;
        const tenantId = req.tenant!.id;
        const existing = await deps.prisma.attributeDefinition.findUnique({
            where: { tenantId_id: { tenantId, id } },
        });
        if (!existing) return reply.code(404).send({ error: "Attribute definition not found" });
        await deps.prisma.attributeDefinition.delete({
            where: { tenantId_id: { tenantId, id } },
        });
        return { ok: true };
    });
};
