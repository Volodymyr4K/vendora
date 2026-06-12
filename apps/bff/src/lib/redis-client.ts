import Redis, { type RedisOptions } from "ioredis";
import { logger } from "./logger.js";
import { redisCommandErrorsTotal, redisCommandsTotal } from "./metrics.js";

export type RedisClientPurpose =
  | "lock"
  | "cache"
  | "cache-warmer"
  | "pubsub-sub"
  | "pubsub-pub"
  | "rate-limit"
  | "bullmq";

function normalizeEnvString(value: string | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

export function resolveRedisUrlFromEnv(): string | null {
  const direct = normalizeEnvString(process.env.REDIS_URL);
  if (direct) return direct;

  // Upstash (preferred if provided): standard Redis URL, e.g. rediss://default:<password>@<host>:<port>
  const upstashUrl = normalizeEnvString(process.env.UPSTASH_REDIS_URL);
  if (upstashUrl) return upstashUrl;

  // Upstash REST-only envs are commonly provided. Best-effort derivation to a rediss:// URL.
  // Notes:
  // - This is intended for dev/staging convenience and local rehearsal tooling.
  // - If it does not work for a given Upstash instance, provide UPSTASH_REDIS_URL explicitly.
  const upstashRestUrl = normalizeEnvString(process.env.UPSTASH_REDIS_REST_URL);
  const upstashRestToken = normalizeEnvString(process.env.UPSTASH_REDIS_REST_TOKEN);
  if (upstashRestUrl && upstashRestToken) {
    let host: string | null = null;
    try {
      host = new URL(upstashRestUrl).hostname;
    } catch {
      host = null;
    }

    const portRaw = normalizeEnvString(process.env.UPSTASH_REDIS_PORT);
    const port = portRaw ? Number(portRaw) : 6379;

    if (host && Number.isFinite(port) && port > 0) {
      const password = encodeURIComponent(upstashRestToken);
      return `rediss://default:${password}@${host}:${port}`;
    }
  }

  const host = normalizeEnvString(process.env.REDIS_HOST);
  if (!host) return null;

  const portRaw = normalizeEnvString(process.env.REDIS_PORT);
  const port = portRaw ? Number(portRaw) : 6379;
  if (!Number.isFinite(port) || port <= 0) return null;

  const password = process.env.REDIS_PASSWORD ?? "";
  const auth = password ? `:${encodeURIComponent(password)}@` : "";
  return `redis://${auth}${host}:${port}`;
}

export function getBullMqConnectionFromEnv(): { url: string } | null {
  const url = resolveRedisUrlFromEnv();
  return url ? { url } : null;
}

function baseRedisOptions(purpose: RedisClientPurpose, url: string | null): RedisOptions {
  const useTls = Boolean(url && url.startsWith("rediss://"));

  // Note: for Pub/Sub and other long-lived connections, ioredis recommends
  // maxRetriesPerRequest = null to avoid MaxRetriesPerRequestError on reconnect.
  const maxRetriesPerRequest = purpose.startsWith("pubsub") ? null : 3;

  const connectionNamePrefix = normalizeEnvString(process.env.REDIS_CONNECTION_NAME_PREFIX) ?? "vendora-bff";
  return {
    maxRetriesPerRequest,
    enableOfflineQueue: false,
    connectTimeout: 10_000,
    retryStrategy: (times) => Math.min(times * 50, 2000),
    reconnectOnError: (err) => err.message.includes("READONLY"),
    connectionName: `${connectionNamePrefix}:${purpose}`,
    ...(useTls ? { tls: {} } : {}),
  };
}

export function createRedisClient(
  purpose: RedisClientPurpose,
  overrides?: RedisOptions & { enableOfflineQueue?: boolean },
  urlOverride?: string
): Redis {
  const url = normalizeEnvString(urlOverride) ?? resolveRedisUrlFromEnv();
  if (!url) {
    throw new Error("Redis is not configured: set REDIS_URL (preferred) or REDIS_HOST/REDIS_PORT");
  }

  const opts: RedisOptions = { ...baseRedisOptions(purpose, url), ...(overrides ?? {}) };
  const client = new Redis(url, opts);

  client.on("connect", () => logger.info({ purpose }, "[REDIS] Connected"));
  client.on("ready", () => logger.info({ purpose }, "[REDIS] Ready"));
  client.on("reconnecting", (delay: number) => logger.warn({ purpose, delay }, "[REDIS] Reconnecting"));
  client.on("end", () => logger.warn({ purpose }, "[REDIS] Connection closed"));
  client.on("error", (err) => {
    redisCommandErrorsTotal.inc({ purpose });
    // Include the error message in the log message so it is visible in dev pretty logs
    // (which may omit structured fields in messageFormat).
    logger.error({ purpose, error: err.message }, `[REDIS] Error: ${err.message}`);
  });

  const commandMetricsEnabled = normalizeEnvString(process.env.REDIS_COMMAND_METRICS_ENABLED) === "true";
  if (commandMetricsEnabled) {
    // ioredis doesn't expose a stable per-command event, so we wrap sendCommand (minimal overhead).
    const originalSendCommand = (client as unknown as { sendCommand: (cmd: unknown, stream?: unknown) => unknown }).sendCommand.bind(client);
    (client as unknown as { sendCommand: (cmd: { name?: string }, stream?: unknown) => unknown }).sendCommand = (cmd, stream) => {
      const name = (cmd?.name ?? "unknown").toString().toLowerCase();
      redisCommandsTotal.inc({ purpose, command: name });
      return originalSendCommand(cmd, stream);
    };
    logger.info({ purpose }, "[REDIS] Command metrics enabled (REDIS_COMMAND_METRICS_ENABLED=true)");
  }

  return client;
}
