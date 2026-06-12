import { z } from "zod";
import { PaymentProviderMode, PaymentProviderStatus, PaymentProviderType } from "@vendora/database";

export const PaymentProviderCreateSchema = z.object({
  type: z.nativeEnum(PaymentProviderType),
  mode: z.nativeEnum(PaymentProviderMode),
  status: z.nativeEnum(PaymentProviderStatus).optional(),
  credentialsRef: z.string().trim().min(1).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

export const PaymentProviderUpdateSchema = z.object({
  status: z.nativeEnum(PaymentProviderStatus).optional(),
  credentialsRef: z.string().trim().min(1).optional().nullable(),
  config: z.record(z.string(), z.unknown()).optional().nullable(),
}).strict();

