/**
 * Type-safe error handling utilities
 * 
 * Provides safe extraction of error messages and stack traces from unknown error types.
 */

/**
 * Safely extract error message from unknown error type
 * 
 * @param error - Unknown error object
 * @returns Error message string
 * 
 * @example
 * ```typescript
 * try {
 *   throw new Error('Something went wrong');
 * } catch (error) {
 *   const message = getErrorMessage(error); // "Something went wrong"
 * }
 * ```
 */
export function getErrorMessage(error: unknown): string {
    // Standard Error instance
    if (error instanceof Error) {
        return error.message;
    }

    // String error
    if (typeof error === 'string') {
        return error;
    }

    // Object with message property
    if (error && typeof error === 'object' && 'message' in error) {
        return String(error.message);
    }

    // Fallback for unknown types
    return 'Unknown error';
}

/**
 * Safely extract error stack trace from unknown error type
 * 
 * @param error - Unknown error object
 * @returns Stack trace string or undefined
 */
export function getErrorStack(error: unknown): string | undefined {
    if (error instanceof Error) {
        return error.stack;
    }

    return undefined;
}

/**
 * Check if error is an Error instance
 * Type guard for Error objects
 */
export function isError(error: unknown): error is Error {
    return error instanceof Error;
}
