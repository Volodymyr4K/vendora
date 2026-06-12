import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { OtpService } from "./otp.service.js";
import {
    zCustomerLoginRequest,
    zCustomerVerifyRequest
} from "@vendora/contracts";
import { validateTenant } from "../../../plugins/tenant-guard.js";
import type { RoutesDependencies } from "../../../types/dependencies.js";

export async function routesCustomerAuth(app: FastifyInstance, deps: RoutesDependencies) {
    const otpService = new OtpService(deps.cache, app.log);

    // POST /auth/customer/otp
    // Generates and sends OTP code
    app.post<{ Body: z.infer<typeof zCustomerLoginRequest> }>("/auth/customer/otp", {
        schema: {
            body: zCustomerLoginRequest
        },
        config: {
            rateLimit: {
                max: 20,                 // Relaxed for manual testing
                timeWindow: '1 minute', // per minute
                keyGenerator: (req) => `otp:${req.ip}` // Limit by IP
            }
        }
    }, async (req, reply) => {
        // 1. Validate Tenant Context
        const tenant = validateTenant(req);

        // 2. Body is auto-validated by Fastify (no manual safeParse needed)
        const { phone } = req.body;

        // 3. Generate Logic
        await otpService.generateAndSend(tenant.id, phone);

        return reply.send({ success: true, message: "Code sent (check logs in dev)" });
    });

    // POST /auth/customer/verify
    // Verifies code and issues Token
    app.post<{ Body: z.infer<typeof zCustomerVerifyRequest> }>("/auth/customer/verify", {
        schema: {
            body: zCustomerVerifyRequest
            // Note: Removed response schema - 401 errors conflict with 200 schema
        },
        config: {
            rateLimit: {
                max: 5,                 // 5 attempts
                timeWindow: '1 minute',
                keyGenerator: (req) => `otp-verify:${req.ip}`
            }
        }
    }, async (req, reply) => {
        const tenant = validateTenant(req);
        // Body is auto-validated by Fastify
        const { phone, code } = req.body;

        // 1. Verify OTP
        const isValid = await otpService.verify(tenant.id, phone, code);
        if (!isValid) {
            return reply.code(401).send({ error: "Invalid or expired code" });
        }

        // 2. Atomic DB Upsert (Find or Create Customer)
        // We use upsert to handle race conditions if user double-clicks verify
        const customer = await deps.prisma.customer.upsert({
            where: {
                phone_tenantId: {
                    phone,
                    tenantId: tenant.id
                }
            },
            create: {
                phone,
                tenantId: tenant.id,
                isVerified: true
            },
            update: {
                isVerified: true // Ensure marked as verified on subsequent logins
            }
        });

        // 3. Issue Token
        const token = await reply.jwtSign({
            role: "customer",
            userId: customer.id, // Standard field for compatibility
            customerId: customer.id, // Explicit field
            tenantId: tenant.id,
            phone: customer.phone
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
        } as any);

        // 4. Send Response
        // We set a cookie too for potential web convenience, though Mobile Apps use Bearer.
        reply.setCookie("customer_token", token, {
            path: "/",
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: "strict",
            maxAge: 30 * 24 * 3600 // 30 days for customers (UX convenience)
        });

        return {
            success: true,
            token,
            customer: {
                id: customer.id,
                phone: customer.phone,
                name: customer.name
            }
        };
    });
}
