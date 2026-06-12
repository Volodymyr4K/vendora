import "dotenv/config";
import { EventBus } from "../src/services/event-bus/bus";
import { logger } from "../src/lib/logger";

async function main() {
    console.log("🔥 Starting Vendora EventBus Smoke Test...");

    // Resolve Redis URL (Same logic as index.ts)
    const redisHost = process.env.REDIS_HOST || "localhost";
    const redisPort = process.env.REDIS_PORT || "6379";
    const redisPassword = process.env.REDIS_PASSWORD ? `:${process.env.REDIS_PASSWORD}@` : "";
    const resolvedRedisUrl = process.env.REDIS_URL || `redis://${redisPassword}${redisHost}:${redisPort}`;

    console.log(`🔌 Connecting to Redis at ${resolvedRedisUrl.replace(/:[^:@]*@/, ":***@")}...`);

    const bus = new EventBus(resolvedRedisUrl);

    const payload = {
        orderId: "smoke-test-123",
        tenantId: "tenant-1",
        branchSlug: "main-branch",
        total: 999.99
    };

    try {
        console.log("📤 Publishing 'order.created' event...");
        await bus.publish("order.created", payload);
        console.log("✅ Event published successfully!");
        console.log("👀 Check your MAIN SERVER logs for: '[Vendora EventBus] Order Created Listener Triggered'");
    } catch (error) {
        console.error("❌ Failed to publish event:", error);
    } finally {
        await bus.close();
        process.exit(0);
    }
}

main().catch(err => {
    console.error("Fatal error:", err);
    process.exit(1);
});
