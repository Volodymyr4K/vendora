import type { FastifyInstance } from "fastify";
import { getOrSet } from "../../../cache/stale.js";
import { mapBranchToPublic } from "../../../utils/mappers.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import { isStorefrontFeatureEnabled } from "../../../lib/feature-guard.js";
import { FEATURE_DISABLED_BODY } from "../../../schemas/storefront-errors.js";
import { NotFoundError } from "../../../errors/business-error.js";

class NoBranchError extends Error {
  constructor() {
    super("No active branches");
    this.name = "NoBranchError";
  }
}

class MultiBranchTenantError extends Error {
  constructor(public branchCount: number) {
    super("Multiple active branches");
    this.name = "MultiBranchTenantError";
  }
}

export async function routesBranches(
  app: FastifyInstance,
  deps: RoutesDependencies
) {
  // ============================================
  // HYBRID SECURITY MODEL
  // ============================================
  // This route group is registered in Layer 2 (public routes) in index.ts
  // GET routes: Public (no authentication required)
  // POST/PATCH/DELETE routes: Must explicitly verify JWT using onRequest hook

  // PUBLIC ROUTES - No JWT required, uses tenant context from subdomain


  // GET /branches - List all active branches for the current tenant
  // Guard: allow if ordering OR delivery OR menu (menu flow needs branch list to pick branch → open menu)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("/branches", async (req: any, reply) => {
    const tenant = validateTenant(req);
    reply.header("Cache-Control", "private, no-store");
    const features = tenant.features;
    if (features && !isStorefrontFeatureEnabled(features, "ordering") && !isStorefrontFeatureEnabled(features, "delivery") && !isStorefrontFeatureEnabled(features, "menu")) {
      return reply.code(403).send(FEATURE_DISABLED_BODY);
    }
    const tenantId = tenant.id;

    const key = `branches:list:${tenantId}`;
    const r = await getOrSet(
      deps.cache,
      key,
      120,
      600,
      async () => {
        // Return all active branches for this tenant
        // PHASE 10: Include tenant to get features (eliminates N+1 in frontend)
        const branches = await deps.prisma.branch.findMany({
          where: {
            tenantId,
            isActive: true,
          },
          include: {
            tenant: {
              select: {
                features: true, // Only select features field for performance
              },
            },
          },
        });
        return branches.map(b => mapBranchToPublic(b));
      },
      { swr: deps.swr, onRevalidateError: (e) => app.log.warn({ err: e }, "branches list revalidate failed") }
    );

    deps.metrics?.cacheResult.inc({ key, result: r.from });
    reply.header("x-cache", r.from);
    reply.header("x-cache-age", String(Math.floor(r.ageSec)));
    return r.data;
  });

  // GET /branches/default - Resolve single-branch default for tenant
  // 0 -> 404, 1 -> 200, >1 -> 409
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  app.get("/branches/default", async (req: any, reply) => {
    const tenant = validateTenant(req);
    reply.header("Cache-Control", "private, no-store");

    const features = tenant.features;
    if (features && !isStorefrontFeatureEnabled(features, "ordering") && !isStorefrontFeatureEnabled(features, "delivery") && !isStorefrontFeatureEnabled(features, "menu")) {
      return reply.code(403).send(FEATURE_DISABLED_BODY);
    }

    const tenantId = tenant.id;
    const key = `branches:default:${tenantId}`;

    try {
      const r = await getOrSet(
        deps.cache,
        key,
        120,
        1800,
        async () => {
          const branches = await deps.prisma.branch.findMany({
            where: {
              tenantId,
              isActive: true,
            },
            include: {
              tenant: {
                select: {
                  features: true,
                },
              },
            },
          });

          const count = branches.length;
          if (count === 0) throw new NoBranchError();
          if (count > 1) throw new MultiBranchTenantError(count);

          return mapBranchToPublic(branches[0]!);
        },
        { swr: deps.swr, onRevalidateError: (e) => app.log.warn({ err: e }, "branches/default revalidate failed") }
      );

      deps.metrics?.cacheResult.inc({ key, result: r.from });
      reply.header("x-cache", r.from);
      reply.header("x-cache-age", String(Math.floor(r.ageSec)));
      return r.data;
    } catch (e) {
      if (e instanceof NoBranchError) {
        return reply.code(404).send({ errorCode: "NO_BRANCH" });
      }
      if (e instanceof MultiBranchTenantError) {
        return reply.code(409).send({ errorCode: "MULTI_BRANCH_TENANT", branchCount: e.branchCount });
      }
      throw e;
    }
  });

  // GET /branches/:branch - Get single branch by slug for the current tenant (audit 3.6, 3.9 C; plan 1.5)
  app.get<{ Params: { branch: string } }>("/branches/:branch", async (req, reply) => {
    const tenant = validateTenant(req);
    reply.header("Cache-Control", "private, no-store");

    const features = tenant.features;
    if (features && !isStorefrontFeatureEnabled(features, "ordering") && !isStorefrontFeatureEnabled(features, "delivery") && !isStorefrontFeatureEnabled(features, "menu")) {
      return reply.code(403).send(FEATURE_DISABLED_BODY);
    }
    const slug = req.params.branch;
    const tenantId = tenant.id;

    const key = `branches:${tenantId}:${slug}`;

    const r = await getOrSet(
      deps.cache,
      key,
      deps.ttlSec,
      deps.staleSec,
      async () => {
        // Find branch within tenant scope (cache: branch data only; tenant merged from req.tenant on each request)
        const branch = await deps.prisma.branch.findFirst({
          where: {
            slug,
            tenantId,
            isActive: true,
          },
          include: {
            tenant: {
              select: {
                features: true, // Required by mapBranchToPublic
              },
            },
          },
        });

        if (!branch) throw new NotFoundError("Branch not found");
        return mapBranchToPublic(branch);
      },
      { swr: deps.swr, onRevalidateError: (e) => app.log.warn({ err: e }, "branch revalidate failed") }
    );

    deps.metrics?.cacheResult.inc({ key, result: r.from });

    reply.header("x-cache", r.from);
    reply.header("x-cache-age", String(Math.floor(r.ageSec)));
    // Merge tenant (name, theme) from req.tenant on every request — not cached (plan 1.5)
    return { ...r.data, tenant: { name: tenant.name, theme: tenant.theme } };
  });

  // PROTECTED ROUTES - Require JWT authentication
  // (Add POST, PATCH, DELETE here if needed in the future)

  // Example protected route structure:
  // app.addHook("onRequest", async (req, reply) => {
  //   await req.jwtVerify();
  // });
  // app.post("/branches", async (req, reply) => { ... });
  // app.patch("/branches/:id", async (req, reply) => { ... });
  // app.delete("/branches/:id", async (req, reply) => { ... });
}
