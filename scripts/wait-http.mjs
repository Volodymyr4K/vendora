import { setTimeout as sleep } from "node:timers/promises";

const url = process.argv[2];
const timeoutMs = Number(process.argv[3] || 30000);
const intervalMs = Number(process.argv[4] || 500);

if (!url) {
  console.error("Usage: node scripts/wait-http.mjs <url> [timeoutMs] [intervalMs]");
  process.exit(1);
}

const deadline = Date.now() + timeoutMs;

while (Date.now() < deadline) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    if (res.ok) {
      process.stdout.write(`ready: ${url}\n`);
      process.exit(0);
    }
  } catch {}
  await sleep(intervalMs);
}

console.error(`timeout waiting for ${url}`);
process.exit(2);
