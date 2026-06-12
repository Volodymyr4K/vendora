import { FastifyRequest } from 'fastify';
import { timingSafeEqual } from 'crypto';

/**
 * Validates the internal API secret using constant-time comparison.
 * safe against timing attacks.
 */
export function isValidInternalSecret(req: FastifyRequest): boolean {
    const secret = req.headers['x-internal-secret'] as string | undefined;
    const expectedSecret = process.env.INTERNAL_API_SECRET || '';

    if (!secret) return false;
    if (!expectedSecret) return false; // Fail safe if env is missing

    const expectedBuffer = Buffer.from(expectedSecret, 'utf-8');
    const providedBuffer = Buffer.from(secret, 'utf-8');

    // Length check (prevent timing leak on length)
    if (expectedBuffer.length !== providedBuffer.length) {
        return false;
    }

    try {
        return timingSafeEqual(expectedBuffer, providedBuffer);
    } catch {
        return false;
    }
}
