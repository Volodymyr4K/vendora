import Fastify from "fastify";
import fjwt from "@fastify/jwt";
import { serializerCompiler, validatorCompiler } from "fastify-type-provider-zod";
import { prisma as realPrisma, type PrismaClient } from "@vendora/database";

import { authPlugin } from "../plugins/auth.js";
import { routesSuperPaymentProviders } from "../domains/super-admin/payment-providers.routes.js";

function parseArg(name: string): string | undefined {
  const idx = process.argv.indexOf(name);
  if (idx === -1) return undefined;
  return process.argv[idx + 1];
}

function makeMockPrisma(args: { tenantId: string }) {
  let createCalls = 0;
  const prisma = {
    tenant: {
      findFirst: async () => ({ id: args.tenantId }),
      findUnique: async ({ where }: any) => (where?.id === args.tenantId ? { id: args.tenantId } : null),
    },
    paymentProvider: {
      findMany: async () => [],
      findFirst: async () => null,
      create: async () => {
        createCalls += 1;
        return { id: "mock-provider", tenantId: args.tenantId };
      },
      update: async () => ({ id: "mock-provider", tenantId: args.tenantId }),
    },
    $disconnect: async () => {},
    __getCreateCalls: () => createCalls,
  };
  return prisma as unknown as PrismaClient & { __getCreateCalls: () => number };
}

async function main() {
  const secret = process.env.SMOKE_JWT_SECRET || "smoke-secret-do-not-use-in-prod";
  const tenantIdArg = parseArg("--tenant") ?? process.argv[2];
  const mode = (process.env.SMOKE_MODE || "mock").toLowerCase();

  const app = Fastify({ logger: false });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(fjwt, { secret });

  const prisma: PrismaClient & { __getCreateCalls?: () => number } =
    mode === "db"
      ? (realPrisma as unknown as PrismaClient)
      : makeMockPrisma({ tenantId: tenantIdArg ?? "11111111-1111-4111-8111-111111111111" });

  await app.register(async (superScope) => {
    await superScope.register(authPlugin, { role: "super-admin" });
    await superScope.register(async (tenantsScope) => {
      await routesSuperPaymentProviders(tenantsScope, { prisma });
    }, { prefix: "/tenants" });
  }, { prefix: "/super" });

  await app.ready();

  const tenantId = tenantIdArg ?? (await prisma.tenant.findFirst({ select: { id: true }, orderBy: { createdAt: "desc" } }))?.id;

  if (!tenantId) {
    throw new Error("No tenant found. Pass tenantId as argv[2] or ensure DB has at least one tenant.");
  }

  const token = await app.jwt.sign({ userId: "smoke-super", role: "SUPER_ADMIN" });

  const listRes = await app.inject({
    method: "GET",
    url: `/super/tenants/${tenantId}/payment-providers`,
    headers: { authorization: `Bearer ${token}` },
  });

  // Validation-only smoke: should 422 and not write.
  const invalidCreateRes = await app.inject({
    method: "POST",
    url: `/super/tenants/${tenantId}/payment-providers`,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    payload: {
      type: "LIQPAY",
      mode: "TEST",
      config: {
        liqpay: {
          publicKey: "pub",
          currentSecretRef: "LIQPAY_PRIVATE_KEY",
          signatureInAlgorithms: ["sha1"],
          signatureOutAlgorithm: "sha1",
          version: 3,
        },
      },
    },
  });

  process.stdout.write(`GET  /super/tenants/${tenantId}/payment-providers -> ${listRes.statusCode}\n`);
  process.stdout.write(`${listRes.body}\n\n`);
  process.stdout.write(`POST /super/tenants/${tenantId}/payment-providers (invalid) -> ${invalidCreateRes.statusCode}\n`);
  process.stdout.write(`${invalidCreateRes.body}\n`);
  if (prisma.__getCreateCalls) {
    process.stdout.write(`\nmock prisma create calls: ${prisma.__getCreateCalls()}\n`);
  }

  await app.close();
  await (prisma as any).$disconnect?.();
}

main().catch(async (err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  try {
    await (realPrisma as any).$disconnect?.();
  } catch {
    // ignore
  }
  process.exitCode = 1;
});
