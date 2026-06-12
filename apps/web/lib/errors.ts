import { zAppError, type AppError } from "@vendora/contracts";

export function toError(err: unknown): Error {
    if (err instanceof Error) return err;
    return new Error(String(err));
}

export function isAppError(err: unknown): err is AppError {
    return zAppError.safeParse(err).success;
}
