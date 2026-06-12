import { writeFileSync, unlinkSync, existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const tmpFile = path.join(rootDir, "__tmp_legacy_probe.ts");

const forbidden = `
export const probe1 = { openTime: "09:00" };
export const probe2 = { closeTime: "21:00" };
export const probe3 = { hours: "10:00 - 22:00", workingSchedule: {} };

// bracket + member access
export function probeAccess(x: any) {
  const a = x["openTime"];
  const b = x.closeTime;
  const c = x.hours;
  return [a, b, c];
}
`;

function run(cmd, args) {
  const res = spawnSync(cmd, args, { stdio: "inherit", cwd: rootDir });
  return res.status ?? 1;
}

function main() {
  writeFileSync(tmpFile, forbidden, "utf8");

  try {
    const failCode = run("node", ["scripts/check-legacy-working-hours.mjs"]);
    if (failCode === 0) {
      console.error("SELFTEST FAILED: guard unexpectedly passed on forbidden patterns.");
      process.exit(1);
    }
  } finally {
    if (existsSync(tmpFile)) unlinkSync(tmpFile);
  }

  const passCode = run("node", ["scripts/check-legacy-working-hours.mjs"]);
  if (passCode !== 0) {
    console.error("SELFTEST FAILED: guard failed after cleanup (repo should be clean).");
    process.exit(1);
  }

  console.log("SELFTEST OK: guard fails on forbidden patterns and passes on clean repo.");
  process.exit(0);
}

main();
