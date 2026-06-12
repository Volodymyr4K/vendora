import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function run(cmd, args, opts = {}) {
  const p = spawn(cmd, args, { stdio: "inherit", shell: process.platform === "win32", ...opts });
  return p;
}

async function wait(url, timeoutMs = 30000) {
  const p = run("node", [path.join(__dirname, "wait-http.mjs"), url, String(timeoutMs)]);
  const code = await new Promise((resolve) => p.on("close", resolve));
  if (code !== 0) throw new Error(`Service not ready: ${url} (code ${code})`);
}

function kill(p) {
  if (!p || p.killed) return;
  try {
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(p.pid), "/f", "/t"]);
    } else {
      p.kill("SIGTERM");
    }
  } catch {}
}

async function main() {
  // Start BFF
  const bff = run("pnpm", ["--filter", "@vendora/bff", "start"], {
    env: { ...process.env, PORT: "4000" },
  });
  await wait("http://localhost:4000/health", 45000);

  // Start Web (Next start)
  const web = run("pnpm", ["--filter", "@vendora/web", "start"], {
    env: { ...process.env },
  });
  await wait("http://localhost:3000/choose-city", 60000);

  // Run Playwright tests
  const tests = run("pnpm", ["--filter", "@vendora/web", "test"]);
  const code = await new Promise((resolve) => tests.on("close", resolve));

  kill(web);
  kill(bff);

  // give processes a moment to stop
  await sleep(500);

  process.exit(code ?? 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
