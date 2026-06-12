import { z } from "zod";

export const zAppError = z.object({
    error: z.string(), // Machine-readable code or short title e.g. "VALIDATION_ERROR" or "Not Found"
    message: z.string(), // Human readable message
    code: z.string().optional(), // Internal legacy code or upstream code e.g. "P2002"
    requestId: z.string().optional(),
    details: z.any().optional(), // Validation details or debug info
});

export type AppError = z.infer<typeof zAppError>;
