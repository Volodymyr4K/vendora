import { prisma, Prisma } from "@vendora/database";
import bcrypt from "bcryptjs";
import { z } from "zod";

import { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import type { FastifyReply } from "fastify";
import { TenantCreateSchema, TenantUpdateSchema, BranchCreateSchema, BranchUpdateSchema, TenantUpdateInput } from "../../schemas/super-admin/tenants.schema.js";
import { cacheManager } from "../../services/cache-manager.js";
import { applyBranchCreateInvariants } from "../../services/tenant-branch-invariants.js";
import { TenantFeatures, DEFAULT_TENANT_FEATURES, zMainTemplateId, type MainTemplateId } from "@vendora/contracts";

const RESERVED_BRANCH_SLUGS = new Set([
    "profile",
    "login",
    "choose-city",
    "register",
    "logout",
    "reset-password",
    "main",
    "privacy",
    "terms",
    "menu",
    "checkout",
    "delivery",
    "p",
]);

function normalizeBranchSlug(slug: string) {
    return slug.trim().toLowerCase();
}

function isReservedBranchSlug(slug: string) {
    return RESERVED_BRANCH_SLUGS.has(normalizeBranchSlug(slug));
}

function sendError(
    reply: FastifyReply,
    statusCode: number,
    code: string,
    message: string,
    extra: Record<string, unknown> = {}
) {
    return reply.code(statusCode).send({ error: message, code, ...extra });
}

function mainTemplateFromSettings(settings: unknown): MainTemplateId {
    const raw = (settings as Record<string, unknown> | null)?.mainTemplate;
    const normalized = typeof raw === "string" ? raw.trim().toLowerCase() : undefined;
    const parsed = zMainTemplateId.safeParse(normalized);
    return parsed.success ? parsed.data : "default";
}

export const routesSuperAdmin: FastifyPluginAsyncZod = async (app) => {
    // JWT Auth Protection is handled by parent scope (Layer 3 in index.ts)
    // This route group is registered with /super prefix via scope registration


    // GET /tenants - List all tenants (prefixed with /super by scope)
    app.get("/tenants", async (_req, _reply) => {
        const tenants = await prisma.tenant.findMany({
            select: {
                id: true,
                name: true,
                slug: true,
                isActive: true,
                countryCode: true,
                currency: true,
                timezone: true,
                features: true, // NEW: Feature flags for UI display
                settings: true,
                createdAt: true,
                _count: {
                    select: {
                        branches: true,
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });

        // Map to include branchCount
        const tenantsWithCount = tenants.map(t => ({
            ...t,
            mainTemplate: mainTemplateFromSettings(t.settings),
            branchCount: t._count.branches,
            _count: undefined, // Remove _count from response
        }));

        return tenantsWithCount;
    });

    // GET /tenants/:id - Get single tenant by id
    app.get<{ Params: { id: string } }>("/tenants/:id", {
        schema: {
            params: z.object({ id: z.string().uuid() })
        }
    }, async (req, reply) => {
        const { id } = req.params;

        const tenant = await prisma.tenant.findUnique({
            where: { id },
            select: {
                id: true,
                name: true,
                slug: true,
                isActive: true,
                countryCode: true,
                currency: true,
                timezone: true,
                features: true,
                settings: true,
                createdAt: true,
                _count: {
                    select: {
                        branches: true,
                    },
                },
            },
        });

        if (!tenant) {
            return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        // Map to include branchCount (same shape as list endpoint)
        const { _count, ...rest } = tenant;
        return { ...rest, mainTemplate: mainTemplateFromSettings(tenant.settings), branchCount: _count.branches };
    });

    // POST /tenants - Create new tenant with admin user
    app.post("/tenants", {
        schema: {
            body: TenantCreateSchema
        }
    }, async (req, reply) => {
        // req.body is inferred from TenantCreateSchema
        const { name, slug, adminEmail, adminPassword, countryCode, currency, timezone } = req.body;

        // Check if slug already exists
        const existingTenant = await prisma.tenant.findUnique({
            where: { slug },
        });

        if (existingTenant) {
            return sendError(reply, 409, "TENANT_SLUG_EXISTS", "Tenant with this slug already exists");
        }

        // Check if admin email already exists
        const existingUser = await prisma.user.findUnique({
            where: { email: adminEmail },
        });

        if (existingUser) {
            return sendError(reply, 409, "USER_EMAIL_EXISTS", "User with this email already exists");
        }

        // Hash the password
        const hashedPassword = await bcrypt.hash(adminPassword, 10);

        // Create tenant and admin user in a transaction (ACCESS_LEVELS Phase 2.3: first user = TENANT_OWNER)
        try {
            const result = await prisma.$transaction(async (tx) => {
                const tenant = await tx.tenant.create({
                    data: {
                        name,
                        slug,
                        isActive: true,
                        countryCode,
                        currency,
                        timezone,
                    },
                });

                const user = await tx.user.create({
                    data: {
                        email: adminEmail,
                        password: hashedPassword,
                        role: "admin",
                        tenantId: tenant.id,
                    },
                });

                await tx.tenantUser.create({
                    data: {
                        tenantId: tenant.id,
                        userId: user.id,
                        role: "TENANT_OWNER",
                    },
                });

                return tenant;
            });

            return reply.code(201).send(result);
        } catch (error) {
            app.log.error({ error }, "Failed to create tenant");
            return sendError(reply, 500, "TENANT_CREATE_FAILED", "Failed to create tenant");
        }
    });

    // PATCH /tenants/:id - Update tenant (Full control including Regional Config)
    app.patch<{ Params: { id: string } }>("/tenants/:id", {
        schema: {
            body: TenantUpdateSchema,
            params: z.object({ id: z.string().uuid() })
        }
    }, async (req, reply) => {
        const { id } = req.params;
        const updates = req.body as TenantUpdateInput;

        try {
            // Find the tenant
            const tenant = await prisma.tenant.findUnique({
                where: { id },
                include: { customDomains: true } // Need this for resolving ghost domains if slug changes, though complex.
            });

            if (!tenant) {
                return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
            }

            // If updating slug, check uniqueness
            if (updates.slug && updates.slug !== tenant.slug) {
                const existing = await prisma.tenant.findUnique({
                    where: { slug: updates.slug },
                });

                if (existing) {
                    return sendError(reply, 409, "TENANT_SLUG_EXISTS", "Tenant with this slug already exists");
                }
            }

            // Handle features deep merge (CRITICAL: Prevent data loss)
            let dataToUpdate: typeof updates = { ...updates };

            if (updates.features) {
                // Read current features from DB
                const currentFeatures = (tenant.features as TenantFeatures) || DEFAULT_TENANT_FEATURES;

                // PHASE 11: Optimistic Locking - Check version conflict
                if (updates.features.version !== undefined && updates.features.version !== currentFeatures.version) {
                    return sendError(reply, 409, "FEATURES_CONFLICT", "Conflict: Features have been updated by another user", {
                        message: "Please refresh the page and try again",
                        currentVersion: currentFeatures.version,
                        yourVersion: updates.features.version
                    });
                }

                // Deep merge: preserve existing fields not sent in the update
                // Phase 1.2: capabilities — only keys from TENANT_CAPABILITY_KEYS (validated by zTenantFeaturesUpdate)
                // ACCESS_LEVELS Phase 1.4: adminModules — keys from ADMIN_MODULE_IDS (validated by zTenantFeaturesUpdate)
                const updatedFeatures: TenantFeatures = {
                    version: (currentFeatures.version || 1) + 1, // PHASE 11: Increment version
                    modules: {
                        ...currentFeatures.modules,
                        ...updates.features.modules,  // Only overwrite sent fields
                    },
                    adminModules: {
                        ...(currentFeatures.adminModules ?? {}),
                        ...(updates.features.adminModules ?? {}),
                    },
                    capabilities:
                        updates.features.capabilities !== undefined
                            ? updates.features.capabilities
                            : (Array.isArray(currentFeatures.capabilities) ? currentFeatures.capabilities : []),
                    limits: {
                        ...(currentFeatures.limits || {}),
                        ...(updates.features.limits || {}),
                    },
                    integrations: {
                        ...(currentFeatures.integrations || {}),
                        ...(updates.features.integrations || {}),
                    },
                };

                // Replace features in data object with merged result
                dataToUpdate = {
                    ...updates,
                    // Prisma JsonValue - validated at runtime via Zod schemas
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    features: updatedFeatures as any,  // Prisma expects JsonValue
                };
            }

            // Update DB with merged data
            const updated = await prisma.tenant.update({
                where: { id },
                data: dataToUpdate,
            });

            // CRITICAL: Cache Invalidation
            // We must invalidate the tenant data so that Storefront picks up changes immediately
            // (especially countryCode/currency for the switch)
            cacheManager.invalidateTenant(id);

            // If slug changed, we might have ghost domains (subdomains) pointing to old slug logic?
            // Actually, subdomain resolution uses `findUnique({ where: { slug } })` on L1 miss.
            // But L1 cache stores `domain -> tenantId`.
            // If slug changes, `old-slug.domain` -> `tenantId`.
            // `new-slug.domain` -> L1 Miss -> DB -> `tenantId`.
            // `old-slug.domain` will still resolve to `tenantId` until cleared!
            // So we should invalidate the old domain mapping if possible. 
            // Since we don't track *every* subdomain in L1 easily without iterating, we rely on TTL (5 min).
            // BUT, for Custom Domains, we should be fine as they map by domain name, which didn't change.

            return updated;
        } catch (error) {
            app.log.error({ error, tenantId: id }, "Failed to update tenant");
            return sendError(reply, 500, "TENANT_UPDATE_FAILED", "Failed to update tenant");
        }
    });

    // PATCH /tenants/:id/main-template - Update tenant main template (safe, narrow)
    app.patch<{ Params: { id: string }; Body: { mainTemplate?: string } }>("/tenants/:id/main-template", {
        schema: {
            params: z.object({ id: z.string().uuid() }),
            body: z.object({ mainTemplate: z.string().min(1) })
        }
    }, async (req, reply) => {
        const { id } = req.params;
        const raw = req.body?.mainTemplate;

        if (typeof raw !== "string") {
            return sendError(reply, 400, "INVALID_MAIN_TEMPLATE", "mainTemplate must be a string");
        }

        const normalized = raw.trim().toLowerCase();
        const parsed = zMainTemplateId.safeParse(normalized);
        if (!parsed.success) {
            return sendError(reply, 400, "INVALID_MAIN_TEMPLATE", "mainTemplate is not in allowlist");
        }

        const tenant = await prisma.tenant.findUnique({
            where: { id },
            select: { id: true, slug: true }
        });

        if (!tenant) {
            return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        const valueJson = JSON.stringify(parsed.data);
        await prisma.$executeRaw(
            Prisma.sql`UPDATE "Tenant" SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{mainTemplate}', (${valueJson})::jsonb) WHERE id = ${id}`
        );

        cacheManager.invalidateTenant(id);

        reply.header("Cache-Control", "private, no-store");
        return reply.code(200).send({
            tenantId: tenant.id,
            tenantSlug: tenant.slug,
            mainTemplate: parsed.data
        });
    });


    // DELETE /tenants/:id - Deactivate tenant
    app.delete<{ Params: { id: string } }>("/tenants/:id", async (req, reply) => {
        const { id } = req.params;

        // Check if tenant exists
        const tenant = await prisma.tenant.findUnique({
            where: { id },
        });

        if (!tenant) {
            return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        try {
            // Deactivate tenant
            await prisma.tenant.update({
                where: { id },
                data: { isActive: false },
            });

            // Invalidate cache to ensure Storefront sees the deactivation immediately
            cacheManager.invalidateTenant(id);

            return reply.code(200).send({ success: true, message: "Tenant deactivated successfully" });
        } catch (error) {
            app.log.error({ error }, "Failed to deactivate tenant");
            return sendError(reply, 500, "TENANT_DEACTIVATE_FAILED", "Failed to deactivate tenant");
        }
    });

    // ============================================
    // BRANCH MANAGEMENT PER TENANT
    // ============================================

    // GET /tenants/:tenantId/branches - List all branches for a tenant
    app.get<{ Params: { tenantId: string } }>("/tenants/:tenantId/branches", {
        schema: {
            params: z.object({ tenantId: z.string().uuid() })
        }
    }, async (req, reply) => {
        const { tenantId } = req.params;

        // Verify tenant exists
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
        });

        if (!tenant) {
            return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        // Fetch all branches for this tenant
        const branches = await prisma.branch.findMany({
            where: { tenantId },
            select: {
                id: true,
                slug: true,
                cityName: true,
                address: true,
                phones: true,
                isActive: true,
                deliveryFee: true,
                freeFrom: true,
                etaMin: true,
                etaMax: true,
                createdAt: true,
            },
            orderBy: { createdAt: "desc" },
        });

        return branches;
    });

    // POST /tenants/:tenantId/branches - Create a branch for a tenant
    app.post("/tenants/:tenantId/branches", {
        schema: {
            body: BranchCreateSchema,
            params: z.object({ tenantId: z.string() })
        }
    }, async (req, reply) => {
        const { tenantId } = req.params;
        const { slug, cityName, address, phone } = req.body;

        if (isReservedBranchSlug(slug)) {
            return sendError(reply, 400, "RESERVED_BRANCH_SLUG", "Branch slug is reserved");
        }

        // Verify tenant exists
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
        });

        if (!tenant) {
            return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        // Check if slug already exists for this tenant
        const existingBranch = await prisma.branch.findFirst({
            where: {
                slug,
                tenantId,
            },
        });

        if (existingBranch) {
            return sendError(reply, 409, "BRANCH_SLUG_EXISTS", "Branch with this slug already exists for this tenant");
        }

        try {
            const { branch, tenantUpdated } = await prisma.$transaction(async (tx) => {
                await tx.$queryRaw`SELECT id FROM "Tenant" WHERE id = ${tenantId} FOR UPDATE`;

                const tenantState = await tx.tenant.findUnique({
                    where: { id: tenantId },
                    select: { branchesMode: true },
                });

                const preBranchCount = await tx.branch.count({ where: { tenantId } });

                const createdBranch = await tx.branch.create({
                    data: {
                        slug,
                        cityName,
                        address: address || null,
                        phones: phone ? [phone] : [],
                        isActive: true,
                        deliveryFee: 0,
                        freeFrom: 0,
                        etaMin: 30,
                        etaMax: 60,
                        zones: [],
                        tenantId,
                    },
                });

                const invariantResult = await applyBranchCreateInvariants({
                    tenantId,
                    newBranchId: createdBranch.id,
                    preBranchCount,
                    priorBranchesMode: tenantState?.branchesMode ?? null,
                    updateTenant: async (data) => {
                        await tx.tenant.update({
                            where: { id: tenantId },
                            data,
                        });
                    },
                });

                return { branch: createdBranch, tenantUpdated: invariantResult.tenantUpdated };
            });

            if (tenantUpdated) {
                cacheManager.invalidateTenant(tenantId);
            }

            return reply.code(201).send(branch);
        } catch (error) {
            app.log.error({ error }, "Failed to create branch");
            return sendError(reply, 500, "BRANCH_CREATE_FAILED", "Failed to create branch");
        }
    });

    // PATCH /tenants/:tenantId/branches/:branchId - Update branch
    app.patch("/tenants/:tenantId/branches/:branchId", {
        schema: {
            body: BranchUpdateSchema,
            params: z.object({ tenantId: z.string(), branchId: z.string() })
        }
    }, async (req, reply) => {
        const { tenantId, branchId } = req.params;
        const updates = req.body;

        // Validate tenant ownership
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
        });

        if (!tenant) {
            return sendError(reply, 404, "TENANT_NOT_FOUND", "Tenant not found");
        }

        // Tenant-scoped read: no id-only read; Branch has no @@unique([id, tenantId])
        const branch = await prisma.branch.findFirst({
            where: { id: branchId, tenantId },
        });

        if (!branch) {
            return sendError(reply, 404, "BRANCH_NOT_FOUND", "Branch not found");
        }

        // If updating slug, check uniqueness within tenant (slug_tenantId unchanged)
        if (updates.slug) {
            const nextSlugNorm = normalizeBranchSlug(updates.slug);
            const currentSlugNorm = normalizeBranchSlug(branch.slug);
            if (nextSlugNorm !== currentSlugNorm && isReservedBranchSlug(updates.slug)) {
                return sendError(reply, 400, "RESERVED_BRANCH_SLUG", "Branch slug is reserved");
            }
        }

        if (updates.slug) {
            const nextSlugNorm = normalizeBranchSlug(updates.slug);
            const currentSlugNorm = normalizeBranchSlug(branch.slug);
            if (nextSlugNorm === currentSlugNorm) {
                // Slug not changing (case/whitespace only), skip uniqueness check.
                // This avoids false 409s on no-op slug updates.
            } else {
            const existing = await prisma.branch.findUnique({
                where: {
                    slug_tenantId: {
                        slug: updates.slug,
                        tenantId,
                    },
                },
            });

            if (existing) {
                return sendError(reply, 409, "BRANCH_SLUG_EXISTS", "Branch with this slug already exists for this tenant");
            }
            }
        }

        try {
            // Tenant-scoped update: use updateMany (no @@unique([id, tenantId]) on Branch)
            const updateRes = await prisma.branch.updateMany({
                where: { id: branchId, tenantId },
                data: updates,
            });

            if (updateRes.count !== 1) {
                return sendError(reply, 404, "BRANCH_NOT_FOUND", "Branch not found");
            }

            const updatedBranch = await prisma.branch.findFirst({
                where: { id: branchId, tenantId },
            });

            if (!updatedBranch) {
                return sendError(reply, 404, "BRANCH_NOT_FOUND", "Branch not found");
            }

            return updatedBranch;
        } catch (error) {
            app.log.error({ error, branchId, tenantId }, "Failed to update branch");
            return sendError(reply, 500, "BRANCH_UPDATE_FAILED", "Failed to update branch");
        }
    });
}
