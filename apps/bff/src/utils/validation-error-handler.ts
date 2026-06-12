import type { ZodError } from 'zod';
import type { FastifyBaseLogger } from 'fastify';

/**
 * Context information for validation errors
 */
export interface ValidationErrorContext {
    /** Service name where validation occurred (e.g., 'upstream', 'prisma') */
    service: string;
    /** Method name where validation occurred (e.g., 'getBranch', 'createOrder') */
    method: string;
    /** Raw data that failed validation (for debugging) */
    rawData?: unknown;
}

/**
 * Centralized validation error handler
 * 
 * Handles Zod validation errors with structured logging and clear error messages.
 * Throws a descriptive error for upstream propagation.
 * 
 * @param error - The error that occurred (should be ZodError)
 * @param logger - Fastify logger instance for structured logging
 * @param context - Context information about where the error occurred
 * @throws Always throws an error with descriptive message
 * 
 * @example
 * ```typescript
 * try {
 *   return zBranchConfig.parse(result);
 * } catch (error) {
 *   return handleValidationError(error, logger, {
 *     service: 'upstream',
 *     method: 'getBranch',
 *     rawData: result,
 *   });
 * }
 * ```
 */
export function handleValidationError(
    error: unknown,
    logger: FastifyBaseLogger,
    context: ValidationErrorContext
): never {
    // Check if this is a Zod validation error
    if (error && typeof error === 'object' && 'issues' in error) {
        const zodError = error as ZodError;

        // Log with full context for debugging
        logger.error({
            msg: 'Upstream data validation failed',
            service: context.service,
            method: context.method,
            validationErrors: zodError.issues,
            rawData: context.rawData,
        });

        // Create user-friendly error message with field paths
        const fieldPaths = zodError.issues
            .map((issue) => issue.path.join('.'))
            .filter((pathStr) => pathStr.length > 0)
            .join(', ');

        const errorMessage = fieldPaths
            ? `Invalid ${context.service} response in ${context.method}: ${fieldPaths}`
            : `Invalid ${context.service} response in ${context.method}`;

        throw new Error(errorMessage);
    }

    // Re-throw non-Zod errors as-is
    throw error;
}
