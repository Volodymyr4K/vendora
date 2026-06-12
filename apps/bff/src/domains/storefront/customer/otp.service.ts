import type { Cache } from "../../../cache/index.js";
import type { FastifyBaseLogger } from "fastify";

// Configuration for OTP behavior
const OTP_TTL_SEC = 300; // 5 minutes
const OTP_MOCK_CODE = "0000";

export class OtpService {
    constructor(
        private cache: Cache,
        private log: FastifyBaseLogger
    ) { }

    private getKey(tenantId: string, phone: string): string {
        return `otp:${tenantId}:${phone}`;
    }

    /**
     * Generates a code, saves it to Redis, and "sends" it (Mock for now)
     */
    async generateAndSend(tenantId: string, phone: string): Promise<void> {
        // In real prod, generate random 4 digits: Math.floor(1000 + Math.random() * 9000).toString()
        // For development/phase 2, use fixed code.
        const code = OTP_MOCK_CODE;
        const key = this.getKey(tenantId, phone);

        this.log.info({ tenantId, phone, code }, "🔐 Generated OTP Code (Mock)");

        // Save to Redis with TTL
        // Using cache.set directly if available or wrapping with a set command.
        // Our 'Cache' interface usually has 'set'.
        // We pass 'stale' time same as ttl for simplicity, or 0 if strict.
        await this.cache.set(key, { code }, OTP_TTL_SEC, OTP_TTL_SEC);

        // TODO: Send SMS via Gateway (TurboSMS, Twilio, etc)
    }

    /**
     * Verifies the code. Returns true if valid, false otherwise.
     * Consumes the code on success (one-time use).
     */
    async verify(tenantId: string, phone: string, code: string): Promise<boolean> {
        const key = this.getKey(tenantId, phone);
        const cached = await this.cache.get<{ code: string }>(key);

        if (!cached) {
            this.log.debug({ tenantId, phone }, "🔐 OTP Verify: Miss (Expired or Invalid)");
            return false;
        }

        if (cached.value.code !== code) {
            this.log.debug({ tenantId, phone, input: code }, "🔐 OTP Verify: Mismatch");
            return false;
        }

        // Success - consume the code to prevent replay attacks
        await this.cache.del(key);

        this.log.info({ tenantId, phone }, "🔐 OTP Verified Successfully");
        return true;
    }
}
