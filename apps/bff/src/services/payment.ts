import { prisma } from "@vendora/database";
import { moneyFromMinor } from "../utils/money.js";
import { stageEvent } from "./outbox/stager.js";
import { logger } from "../lib/logger.js";
import { updateOrder } from "./order-update.js";

export class PaymentService {
    constructor(
        private readonly baseUrl: string
    ) { }

    public createPayment(orderId: string, amountCents: number, token: string) {
        // In a real app, this would call Monobank/Stripe/etc.
        // Here we generate a URL to our frontend sandbox page.
        const params = new URLSearchParams({
            orderId,
            amount: String(moneyFromMinor(amountCents)),
            token,
        });
        return `${this.baseUrl}/checkout/test-payment?${params.toString()}`;
    }

    public async confirmPayment(token: string, tenantId?: string) {
        if (!tenantId) throw new Error("Tenant context required");

        // 1. Find order (Read-before-write, optimization check)
        const order = await prisma.order.findUnique({
            where: { tenantId_token: { tenantId, token } },
            select: { status: true, orderId: true }
        });
        if (!order) throw new Error("Order not found");

        // Idempotency: Prevent double-processing
        if (order.status === "paid" || order.status === "done") {
            logger.info({ orderId: order.orderId }, "Payment idempotency hit: Order already paid");
            return { status: order.status, alreadyPaid: true };
        }

        return await prisma.$transaction(async (tx) => {
            // 2. Lock & Update status (central updateOrder enforces payload immutability)
            const updated = await updateOrder(
                tx,
                { tenantId, token },
                { status: "paid" }
            );

            // 3. Stage Event (Transactional Outbox)
            await stageEvent(
                tx,
                "order.paid",
                {
                    tenantId: updated.tenantId,
                    orderId: updated.orderId,
                    amount: moneyFromMinor(Number(updated.total)),
                    token: updated.token
                }
            );

            return { status: updated.status, alreadyPaid: false };
        });
    }
}

export function createPaymentService(baseUrl: string) {
    return new PaymentService(baseUrl);
}
