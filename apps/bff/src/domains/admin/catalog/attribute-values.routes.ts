/**
 * Phase 5.1: AttributeValue — CRUD, tenant-scoped. One value per (item, definition); exactly one value* filled (DB CHECK).
 * Filters by value only for definitions with isFilterable.
 */
import { z } from "zod";
import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { AdminDeps } from "../types.js";
import { invalidateMenu } from "./catalog.service.js";

const zAttributeValueCreate = z.object({
    itemId: z.string().uuid(),
    definitionId: z.string().uuid(),
    valueString: z.string().optional(),
    valueNumber: z.number().optional(),
    valueBool: z.boolean().optional(),
    valueDate: z.string().datetime().optional(),
}).refine(
    (data) => {
        const set = [data.valueString !== undefined, data.valueNumber !== undefined, data.valueBool !== undefined, data.valueDate !== undefined];
        return set.filter(Boolean).length === 1;
    },
    { message: "Exactly one of valueString, valueNumber, valueBool, valueDate must be set" }
);

const zAttributeValueUpdate = z.object({
    valueString: z.string().optional().nullable(),
    valueNumber: z.number().optional().nullable(),
    valueBool: z.boolean().optional().nullable(),
    valueDate: z.string().datetime().optional().nullable(),
}).refine(
    (data) => {
        const count = [data.valueString !== undefined, data.valueNumber !== undefined, data.valueBool !== undefined, data.valueDate !== undefined].filter(Boolean).length;
        return count === 1;
    },
    { message: "Exactly one of valueString, valueNumber, valueBool, valueDate must be provided for update" }
).strict();

export const attributeValuesRoutes: FastifyPluginAsyncZod = async (app, opts) => {
    const deps = opts as unknown as AdminDeps;

    // List values (tenant-scoped); optional itemId, definitionId; filter by value only when definition isFilterable
    app.get<{
        Querystring: { itemId?: string; definitionId?: string; valueString?: string; valueNumber?: string; valueBool?: string; valueDate?: string };
    }>("/attribute-values", async (req, reply) => {
        const tenantId = req.tenant!.id;
        const { itemId, definitionId, valueString, valueNumber, valueBool, valueDate } = req.query;

        const valueFilters: { valueString?: string; valueNumber?: number; valueBool?: boolean; valueDate?: Date } = {};
        if (valueString !== undefined) valueFilters.valueString = valueString;
        if (valueNumber !== undefined) valueFilters.valueNumber = Number(valueNumber);
        if (valueBool !== undefined) valueFilters.valueBool = valueBool === "true";
        if (valueDate !== undefined) valueFilters.valueDate = new Date(valueDate);

        const hasValueFilter = Object.keys(valueFilters).length > 0;
        if (hasValueFilter && definitionId) {
            const def = await deps.prisma.attributeDefinition.findFirst({
                where: { id: definitionId, tenantId },
            });
            if (!def) return reply.code(404).send({ error: "Attribute definition not found" });
            if (!def.isFilterable) {
                return reply.code(400).send({ error: "Filtering by value is only allowed for definitions with isFilterable=true" });
            }
        }
        if (hasValueFilter && !definitionId) {
            return reply.code(400).send({ error: "definitionId is required when filtering by value" });
        }

        const list = await deps.prisma.attributeValue.findMany({
            where: {
                tenantId,
                ...(itemId && { itemId }),
                ...(definitionId && { definitionId }),
                ...valueFilters,
            },
            include: { definition: { select: { id: true, key: true, label: true, valueType: true, isFilterable: true } } },
            orderBy: [{ definitionId: "asc" }, { itemId: "asc" }],
        });
        return list;
    });

    // Create value (item and definition must belong to tenant)
    app.post<{ Body: z.infer<typeof zAttributeValueCreate> }>("/attribute-values", {
        schema: { body: zAttributeValueCreate },
    }, async (req, reply) => {
        const body = req.body;
        const tenantId = req.tenant!.id;

        const item = await deps.prisma.catalogItem.findFirst({
            where: { id: body.itemId, tenantId },
        });
        if (!item) return reply.code(404).send({ error: "Catalog item not found" });

        const def = await deps.prisma.attributeDefinition.findUnique({
            where: { tenantId_id: { tenantId, id: body.definitionId } },
        });
        if (!def) return reply.code(404).send({ error: "Attribute definition not found" });

        const valueString = body.valueString !== undefined ? body.valueString : null;
        const valueNumber = body.valueNumber !== undefined ? body.valueNumber : null;
        const valueBool = body.valueBool !== undefined ? body.valueBool : null;
        const valueDate = body.valueDate !== undefined ? new Date(body.valueDate) : null;

        const created = await deps.prisma.attributeValue.create({
            data: {
                tenantId,
                itemId: body.itemId,
                definitionId: body.definitionId,
                valueString,
                valueNumber,
                valueBool,
                valueDate,
            },
        });
        await invalidateMenu(deps, tenantId);
        return created;
    });

    // Get one by id (tenant-scoped via findFirst)
    app.get<{ Params: { id: string } }>("/attribute-values/:id", async (req, reply) => {
        const row = await deps.prisma.attributeValue.findFirst({
            where: { id: req.params.id, tenantId: req.tenant!.id },
            include: { definition: { select: { id: true, key: true, label: true, valueType: true } } },
        });
        if (!row) return reply.code(404).send({ error: "Attribute value not found" });
        return row;
    });

    // Update: resolve by id then update by compound key
    app.patch<{ Params: { id: string }; Body: z.infer<typeof zAttributeValueUpdate> }>("/attribute-values/:id", {
        schema: { body: zAttributeValueUpdate, params: z.object({ id: z.string().uuid() }) },
    }, async (req, reply) => {
        const { id } = req.params;
        const body = req.body;
        const tenantId = req.tenant!.id;

        const existing = await deps.prisma.attributeValue.findFirst({
            where: { id, tenantId },
        });
        if (!existing) return reply.code(404).send({ error: "Attribute value not found" });

        const data: { valueString: string | null; valueNumber: number | null; valueBool: boolean | null; valueDate: Date | null } = {
            valueString: null,
            valueNumber: null,
            valueBool: null,
            valueDate: null,
        };
        if (body.valueString !== undefined) data.valueString = body.valueString;
        else if (body.valueNumber !== undefined) data.valueNumber = body.valueNumber;
        else if (body.valueBool !== undefined) data.valueBool = body.valueBool;
        else if (body.valueDate !== undefined) data.valueDate = body.valueDate ? new Date(body.valueDate) : null;

        const updated = await deps.prisma.attributeValue.update({
            where: { tenantId_itemId_definitionId: { tenantId, itemId: existing.itemId, definitionId: existing.definitionId } },
            data,
        });
        await invalidateMenu(deps, tenantId);
        return updated;
    });

    // Delete: resolve by id then delete by compound key
    app.delete<{ Params: { id: string } }>("/attribute-values/:id", async (req, reply) => {
        const { id } = req.params;
        const tenantId = req.tenant!.id;

        const existing = await deps.prisma.attributeValue.findFirst({
            where: { id, tenantId },
        });
        if (!existing) return reply.code(404).send({ error: "Attribute value not found" });

        await deps.prisma.attributeValue.delete({
            where: { tenantId_itemId_definitionId: { tenantId, itemId: existing.itemId, definitionId: existing.definitionId } },
        });
        await invalidateMenu(deps, tenantId);
        return { ok: true };
    });
};
