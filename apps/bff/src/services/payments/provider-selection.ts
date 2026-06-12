import type { PrismaClient } from "@vendora/database";

export type PaymentsMode = "TEST" | "LIVE";

export type ProviderSelectionErrorCode =
  | "PROVIDER_NOT_FOUND"
  | "PROVIDER_NOT_ACTIVE"
  | "PROVIDER_MODE_MISMATCH"
  | "NO_ACTIVE_PROVIDER_FOR_MODE"
  | "MULTIPLE_ACTIVE_PROVIDERS_REQUIRE_PROVIDER_ID";

export type ProviderSelectionResult =
  | {
      ok: true;
      provider: {
        id: string;
        tenantId: string;
        type: "MOLLIE" | "MONOBANK" | "LIQPAY";
        mode: PaymentsMode;
        status: "ACTIVE" | "DISABLED";
        credentialsRef: string | null;
        config: unknown;
      };
    }
  | {
      ok: false;
      code: ProviderSelectionErrorCode;
    };

export async function selectPaymentProviderForCheckout(args: {
  prisma: PrismaClient;
  tenantId: string;
  mode: PaymentsMode;
  providerId?: string | undefined;
}): Promise<ProviderSelectionResult> {
  const { prisma, tenantId, mode, providerId } = args;

  if (providerId) {
    const provider = await prisma.paymentProvider.findFirst({
      where: { id: providerId, tenantId },
      select: {
        id: true,
        tenantId: true,
        type: true,
        mode: true,
        status: true,
        credentialsRef: true,
        config: true,
      },
    });
    if (!provider) return { ok: false, code: "PROVIDER_NOT_FOUND" };
    if (provider.status !== "ACTIVE") return { ok: false, code: "PROVIDER_NOT_ACTIVE" };
    if (provider.mode !== mode) return { ok: false, code: "PROVIDER_MODE_MISMATCH" };
    return { ok: true, provider };
  }

  const providers = await prisma.paymentProvider.findMany({
    where: { tenantId, status: "ACTIVE", mode },
    select: {
      id: true,
      tenantId: true,
      type: true,
      mode: true,
      status: true,
      credentialsRef: true,
      config: true,
    },
    orderBy: { createdAt: "asc" },
  });

  if (providers.length === 0) return { ok: false, code: "NO_ACTIVE_PROVIDER_FOR_MODE" };
  if (providers.length > 1) return { ok: false, code: "MULTIPLE_ACTIVE_PROVIDERS_REQUIRE_PROVIDER_ID" };
  return { ok: true, provider: providers[0]! };
}

