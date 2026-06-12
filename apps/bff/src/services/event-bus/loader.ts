import { WorkerFactory } from "./worker.js";
import { logger } from "../../lib/logger.js";

// Define a minimal shape for deps to avoid circular imports or complex types for this MVP
// In a real app, you'd import the ServiceDependencies type from a central types file
// Dynamic module loading - type handled at runtime
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceDependencies = any;

export async function registerEventHandlers(worker: WorkerFactory, _deps: ServiceDependencies) {
    logger.info("[Vendora EventBus] Registering event handlers...");

    worker.subscribe("order.created", async (payload) => {
        logger.info({ payload }, "[Vendora EventBus] HANDLER: Order Created");
    });

    worker.subscribe("order.status_updated", async (payload) => {
        logger.info({ payload }, "[Vendora EventBus] HANDLER: Order Status Updated");
    });

    worker.subscribe("menu.updated", async (payload) => {
        logger.info({ payload }, "[Vendora EventBus] HANDLER: Menu Updated");
    });
}
