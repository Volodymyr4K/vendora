import { Worker, Job, type ConnectionOptions } from "bullmq";
import { MAIN_QUEUE_NAME, EventName, EventHandler } from "./types.js";
import { logger } from "../../lib/logger.js";

export class WorkerFactory {
    private worker: Worker | undefined;
    private connection: ConnectionOptions;

    // Registry: EventName -> Array of Handlers
    // Generic worker handler
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    private handlers: Map<EventName, EventHandler<any>[]> = new Map();

    constructor(connection: ConnectionOptions | string) {
        this.connection = typeof connection === "string" ? { url: connection } : connection;
    }

    /**
     * Register a handler for a specific event.
     * Supports multiple handlers per event (Fan-Out).
     */
    subscribe<K extends EventName>(event: K, handler: EventHandler<K>) {
        const existing = this.handlers.get(event) || [];
        existing.push(handler);
        this.handlers.set(event, existing);
        logger.info({ event }, "[Vendora EventBus] Registered event handler");
    }

    start() {
        const parseIntEnv = (name: string) => {
            const raw = (process.env[name] ?? "").trim();
            if (!raw) return undefined;
            const n = Number.parseInt(raw, 10);
            return Number.isFinite(n) ? n : undefined;
        };

        const validateInt = (args: { name: string; def: number; min: number; max: number }) => {
            const n = parseIntEnv(args.name);
            if (n == null) return args.def;
            if (n < args.min || n > args.max) {
                logger.warn(
                    { name: args.name, value: n, min: args.min, max: args.max, fallback: args.def },
                    "[Vendora EventBus] Invalid env value (fallback to default)"
                );
                return args.def;
            }
            return n;
        };

        const concurrency = validateInt({ name: "EVENT_BUS_WORKER_CONCURRENCY", def: 1, min: 1, max: 10 });
        const drainDelay = validateInt({ name: "EVENT_BUS_WORKER_DRAIN_DELAY_SEC", def: 10, min: 1, max: 60 });
        const stalledInterval = validateInt({
            name: "EVENT_BUS_WORKER_STALLED_INTERVAL_MS",
            def: 120_000,
            min: 30_000,
            max: 600_000,
        });

        this.worker = new Worker(
            MAIN_QUEUE_NAME,
            async (job: Job) => {
                const eventName = job.name as EventName;
                const payload = job.data;
                const handlers = this.handlers.get(eventName) || [];

                if (handlers.length === 0) {
                    logger.warn({ event: eventName, jobId: job.id }, "[Vendora EventBus] No handlers registered for event");
                    return;
                }

                logger.info(
                    { event: eventName, jobId: job.id, handlerCount: handlers.length },
                    "[Vendora EventBus] Processing event [Fan-Out]"
                );

                // SAFE FAN-OUT POLICY: "Partial Success is better than Duplicate Execution"
                // We use Promise.allSettled to ensure that if Handler A succeeds but Handler B fails,
                // Handler A is NOT re-executed (which would happen if we let the Job fail and retry).
                const results = await Promise.allSettled(
                    handlers.map(handler => handler(payload))
                );

                let failureCount = 0;

                results.forEach((result, index) => {
                    if (result.status === "rejected") {
                        failureCount++;
                        // CRITICAL LOGGING: Identify exactly which handler failed
                        logger.error(
                            {
                                event: eventName,
                                jobId: job.id,
                                handlerIndex: index,
                                error: result.reason
                            },
                            "[Vendora EventBus] CRITICAL: Event Handler failed. Skipping to prevent double-execution of successful handlers."
                        );
                    }
                });

                // ONLY Throw if TOTAL FAILURE (All handlers failed)
                // If even one succeeded, we mark the Job as Done to preserve that success.
                if (failureCount === handlers.length) {
                    throw new Error(`[Vendora EventBus] All ${handlers.length} handlers failed for event ${eventName}. Forces Retry.`);
                }

                if (failureCount > 0) {
                    logger.warn(
                        { success: handlers.length - failureCount, failures: failureCount },
                        "[Vendora EventBus] Event completed with PARTIAL FAILURES"
                    );
                } else {
                    logger.debug({ jobId: job.id }, "[Vendora EventBus] Event processed successfully (All handlers OK)");
                }
            },
            {
                connection: this.connection,
                concurrency,
                // drainDelay is in seconds (BullMQ long-poll timeout when empty).
                drainDelay,
                stalledInterval,
            }
        );

        this.worker.on("failed", (job, err) => {
            logger.error({ jobId: job?.id, event: job?.name, error: err }, "[Vendora EventBus] Job Failed (Will Retry)");
        });

        logger.info(
            { concurrency, drainDelaySec: drainDelay, stalledIntervalMs: stalledInterval },
            "[Vendora EventBus] WorkerFactory started"
        );
    }

    async close() {
        if (this.worker) {
            await this.worker.close();
        }
    }
}
