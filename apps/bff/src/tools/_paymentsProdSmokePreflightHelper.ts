import crypto from "node:crypto";
import { Queue, QueueEvents } from "bullmq";

function randId(prefix: string) {
  const raw = crypto.randomBytes(10).toString("hex");
  return `${prefix}_${Date.now()}_${raw}`;
}

export async function runPaymentsProdSmokePreflight(args: { redisUrl: string; timeoutMs?: number }) {
  const timeoutMs = typeof args.timeoutMs === "number" ? args.timeoutMs : 15_000;

  const queue = new Queue("vendora-payments", { connection: { url: args.redisUrl } });
  const qe = new QueueEvents("vendora-payments", { connection: { url: args.redisUrl } });

  const pingId = randId("payments_smoke_preflight");
  const jobId = `payments:health.ping:${pingId}`;

  try {
    await qe.waitUntilReady();

    const done = new Promise<{ ok: true } | { ok: false; code: "FAILED" | "TIMEOUT" }>((resolve) => {
      const timer = setTimeout(() => {
        cleanup();
        resolve({ ok: false, code: "TIMEOUT" });
      }, timeoutMs);

      const onCompleted = (evt: { jobId: string }) => {
        if (evt.jobId !== jobId) return;
        cleanup();
        resolve({ ok: true });
      };

      const onFailed = (evt: { jobId: string }) => {
        if (evt.jobId !== jobId) return;
        cleanup();
        resolve({ ok: false, code: "FAILED" });
      };

      const cleanup = () => {
        clearTimeout(timer);
        qe.off("completed", onCompleted as any);
        qe.off("failed", onFailed as any);
      };

      qe.on("completed", onCompleted as any);
      qe.on("failed", onFailed as any);
    });

    await queue.add("health.ping", { pingId }, { jobId, removeOnComplete: true, removeOnFail: true, attempts: 1 });

    const res = await done;
    if (!res.ok) {
      throw new Error(`payments preflight failed (${res.code})`);
    }

    return { ok: true as const, jobId };
  } finally {
    await qe.close().catch(() => {});
    await queue.close().catch(() => {});
  }
}
