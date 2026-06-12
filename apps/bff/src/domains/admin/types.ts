import { prisma } from "@vendora/database";
import type { Cache } from "../../cache/index.js";
import { PubSubService } from "../../services/pubsub.js";

export type AdminDeps = {
    prisma: typeof prisma;
    cache: Cache;
    pubsub?: PubSubService;
    eventBus?: import("../../services/event-bus/bus.js").EventBus; // Phase 3
};
