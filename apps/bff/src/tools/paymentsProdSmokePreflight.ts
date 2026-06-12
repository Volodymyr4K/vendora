import { resolveRedisUrlFromEnv } from "../lib/redis-client.js";
import { runPaymentsProdSmokePreflight } from "./_paymentsProdSmokePreflightHelper.js";

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

async function main() {
  const allow = (process.env.PAYMENTS_PROD_SMOKE_ALLOW ?? "").trim().toLowerCase() === "true";
  assert(allow, "Refusing to run: set PAYMENTS_PROD_SMOKE_ALLOW=true");

  const redisUrl = resolveRedisUrlFromEnv();
  assert(redisUrl, "Redis not configured (expected REDIS_URL or UPSTASH_* envs)");

  const res = await runPaymentsProdSmokePreflight({ redisUrl, timeoutMs: 15_000 });

  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ ok: true, tool: "paymentsProdSmokePreflight", jobId: res.jobId }));
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e instanceof Error ? e.message : String(e));
  process.exitCode = 1;
});
