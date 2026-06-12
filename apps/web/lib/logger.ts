

/**
 * Universal Logger for Web App (Edge-Safe, PII-Aware, Crash-Proof)
 * 
 * Features:
 * 1. PII Sanitization (Tokens, Phones, OTPs redacted)
 * 2. SSR/Edge Safe (No Node.js APIs like 'fs' or 'path')
 * 3. Circular Reference Protection (WeakSet)
 * 4. Depth Limit (Max 8 levels)
 * 5. Safe Error Normalization (Handles unknown, sanitizes cause)
 * 6. Safe Serialization (BigInt support)
 */

const IS_DEV = process.env.NODE_ENV === 'development';

// ----------------------------------------------------------------------
// CONFIGURATION
// ----------------------------------------------------------------------

const MAX_DEPTH = 8;
const MAX_STRING_LENGTH = 500;

const PII_DENYLIST = new Set([
    'token',
    'otp',
    'code',
    'password',
    'secret',
    'authorization',
    'cookie',
    'set-cookie',
    'session',
    'jwt',
    'creditcard',
    'cvv',
    'phone' // Direct phone number
]);

// ----------------------------------------------------------------------
// TYPES
// ----------------------------------------------------------------------

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

// ----------------------------------------------------------------------
// UTILITIES (Pure Functions)
// ----------------------------------------------------------------------

/**
 * Safe serializer that handles Circular Refs, BigInt, and Depth Limit.
 * Also performs PII redaction.
 */
function safeSerialize(value: unknown, depth = 0, seen = new WeakSet<object>()): unknown {
    // 1. Primitive handling
    if (value === null) return null;
    if (value === undefined) return undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value;

    if (typeof value === 'bigint') {
        return `[BigInt: ${value.toString()}]`;
    }

    if (typeof value === 'string') {
        // Truncate long strings
        if (value.length > MAX_STRING_LENGTH) {
            return value.substring(0, MAX_STRING_LENGTH) + '...[TRUNCATED]';
        }
        return value;
    }

    if (typeof value === 'function') {
        return `[Function: ${value.name || 'anonymous'}]`;
    }

    if (typeof value === 'symbol') {
        return value.toString();
    }

    // 2. Depth Check
    if (depth >= MAX_DEPTH) {
        return '[MaxDepthReached]';
    }

    // 3. Object/Array handling
    if (typeof value === 'object') {
        // 3.1 Circular Check
        if (seen.has(value)) {
            return '[Circular]';
        }
        seen.add(value);

        // 3.2 Special Objects
        if (value instanceof Date) {
            return value.toISOString();
        }
        if (value instanceof Error) {
            // Manual error serialization to ensure we get stacks/messages
            return {
                name: value.name,
                message: value.message,
                stack: IS_DEV ? value.stack : undefined, // Reduce noise in prod
                cause: safeSerialize((value as Error & { cause?: unknown }).cause, depth + 1, seen)
            };
        }

        // 3.3 Arrays
        if (Array.isArray(value)) {
            return value.map(item => safeSerialize(item, depth + 1, seen));
        }

        // 3.4 Plain Objects
        const result: Record<string, unknown> = {};
        for (const [key, val] of Object.entries(value)) {
            // PII Check based on Key Name
            if (PII_DENYLIST.has(key.toLowerCase())) {
                result[key] = '***';
            } else {
                result[key] = safeSerialize(val, depth + 1, seen);
            }
        }
        return result;
    }

    return String(value);
}

/**
 * Normalizes an unknown error into a stable structure.
 */
function normalizeError(err: unknown): Record<string, unknown> {
    if (err instanceof Error) {
        return safeSerialize(err) as Record<string, unknown>;
    }

    if (typeof err === 'string') {
        return { name: 'Error', message: err };
    }

    // Fallback
    return {
        name: 'UnknownError',
        message: String(err),
        raw: safeSerialize(err)
    } as Record<string, unknown>;
}

// ----------------------------------------------------------------------
// LOGGER IMPLEMENTATION
// ----------------------------------------------------------------------

function log(level: LogLevel, message: string, meta?: unknown) {
    // In production, we might want to filter debug logs
    if (!IS_DEV && level === 'debug') return;

    const timestamp = new Date().toISOString();
    let serializedMeta = meta !== undefined ? safeSerialize(meta) : undefined;

    // If we are logging an Error object as meta, ensure it's normalized
    if (meta instanceof Error) {
        serializedMeta = normalizeError(meta);
    }

    // Console formatting
    // In Dev: Human readable
    // In Prod: JSON structured (usually better for log viewers)

    if (IS_DEV) {
        const prefix = `[${timestamp}] [${level.toUpperCase()}]`;
        const args: unknown[] = [prefix, message];
        if (serializedMeta !== undefined) args.push(serializedMeta);

        switch (level) {
            case 'debug': console.info(...args); break;
            case 'info': console.info(...args); break;
            case 'warn': console.warn(...args); break;
            case 'error': console.error(...args); break;
        }
    } else {
        // Production JSON layout
        const payload = {
            ts: timestamp,
            lvl: level,
            msg: message,
            ...(serializedMeta ? { meta: serializedMeta } : {})
        };

        // Use console methods appropriately (modern infra often captures stdout/stderr)
        const json = JSON.stringify(payload);
        switch (level) {
            case 'debug': console.info(json); break;
            case 'info': console.info(json); break;
            case 'warn': console.warn(json); break;
            case 'error': console.error(json); break;
        }
    }
}

export const logger = {
    debug: (message: string, meta?: unknown) => log('debug', message, meta),
    info: (message: string, meta?: unknown) => log('info', message, meta),
    warn: (message: string, meta?: unknown) => log('warn', message, meta),

    /**
     * Safe error logging.
     * Can accept an Error object as the second argument, or a meta object.
     */
    error: (message: string, errorOrMeta?: unknown) => {
        // If second arg is an Error, normalize it specially
        if (errorOrMeta instanceof Error) {
            log('error', message, errorOrMeta);
        } else {
            log('error', message, errorOrMeta);
        }
    }
};
