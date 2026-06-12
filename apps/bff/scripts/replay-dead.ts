import { prisma, OutboxStatus } from "@vendora/database";
import { logger } from "../src/lib/logger";

const eventId = process.argv[2];

if (!eventId) {
    console.error("Usage: pnpm tsx scripts/replay-dead.ts <eventId>");
    process.exit(1);
}

async function replay() {
    try {
        const record = await prisma.eventOutbox.findUnique({
            where: { id: eventId }
        });

        if (!record) {
            logger.error({ eventId }, "Event not found");
            process.exit(1);
        }

        if (record.status !== OutboxStatus.DEAD) {
            logger.warn({ eventId, status: record.status }, "Event is not DEAD. Skipping replay.");
            process.exit(0);
        }

        await prisma.eventOutbox.update({
            where: { id: eventId },
            data: {
                status: OutboxStatus.PENDING,
                attempts: 0,
                lastError: null,
                nextAttemptAt: new Date()
            }
        });

        // Structure log as requested
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const payload = record.payload as any;
        logger.info({
            type: "OUTBOX_REPLAY",
            eventId,
            orderId: payload.orderId || "unknown",
            eventType: record.eventType
        }, "Event replayed (moved to PENDING)");

    } catch (err) {
        logger.error({ err }, "Failed to replay event");
        process.exit(1);
    }
}

replay();
