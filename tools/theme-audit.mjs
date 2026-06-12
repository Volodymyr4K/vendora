import fs from "fs";
import path from "path";

function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch { return false; }
}
function isFile(p) {
  try { return fs.statSync(p).isFile(); } catch { return false; }
}
function findRepoRoot(startDir) {
  let cur = path.resolve(startDir);
  for (let i = 0; i < 50; i++) {
    if (isDir(path.join(cur, ".git")) || isFile(path.join(cur, "pnpm-workspace.yaml")) || isFile(path.join(cur, "package.json"))) {
      return cur;
    }
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return path.resolve(startDir);
}
function walk(dir, ignoreDirs, out) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (ignoreDirs.has(e.name)) continue;
      walk(p, ignoreDirs, out);
    } else if (e.isFile()) {
      out.push(p);
    }
  }
}
function countRegex(content, re) {
  let n = 0;
  re.lastIndex = 0;
  while (re.exec(content)) n++;
  return n;
}
function readText(filePath) {
  try { return fs.readFileSync(filePath, "utf8"); } catch { return ""; }
}

const repoRoot = findRepoRoot(process.cwd());
const targetRoot = path.join(repoRoot, "apps", "web");

if (!isDir(targetRoot)) {
  console.error("[ERROR] apps/web not found at:", targetRoot);
  process.exit(1);
}

const ignoreDirs = new Set([
  "node_modules", ".next", "dist", "build", "coverage", ".turbo", ".git", ".cache"
]);

const allPaths = [];
walk(targetRoot, ignoreDirs, allPaths);

const exts = new Set([".ts", ".tsx", ".js", ".jsx", ".css"]);
const files = allPaths.filter((p) => exts.has(path.extname(p)));

const BUCKETS = [
  {
    key: "A",
    name: "Neutral hardcodes",
    regexes: [
      /bg-white/g,
      /text-black/g,
      /border-black/g,
      /bg-gray-/g,
      /text-gray-/g,
      /border-gray-/g,
      /hover:text-black/g,
      /focus:border-black/g,
    ],
  },
  {
    key: "B",
    name: "Focus blues",
    regexes: [
      /focus:ring-blue-/g,
      /focus:border-blue-/g,
    ],
  },
  {
    key: "C",
    name: "Radii/Shadows/Fonts (non-theme)",
    // Count raw occurrences, then subtract theme-token occurrences so we don't lie.
    // We intentionally count exact tokens like rounded-xl, rounded-lg, rounded-md, " rounded " and "shadow*".
    regexes: [
      /\brounded-xl\b/g,
      /\brounded-lg\b/g,
      /\brounded-md\b/g,
      // "rounded" token (but will exclude rounded-theme later)
      /(^|\s)rounded(\s|["'`])/g,
      /\bshadow-2xl\b/g,
      /\bshadow-xl\b/g,
      /\bshadow-lg\b/g,
      /\bshadow-sm\b/g,
      // "shadow" token (but will exclude shadow-theme later)
      /(^|\s)shadow(\s|["'`])/g,
      /\bfont-mono\b/g,
      /\bfont-sans\b/g,
    ],
    postFilter: (content) => {
      // subtract "rounded-theme" and "shadow-theme" occurrences so bucket C represents "still hardcoded"
      const roundedTheme = countRegex(content, /\brounded-theme\b/g);
      const shadowTheme = countRegex(content, /\bshadow-theme\b/g);
      return { subtract: roundedTheme + shadowTheme };
    }
  },
  {
    key: "D",
    name: "Inline styles / raw colors",
    regexes: [
      /style=\{\{/g,
      /#[0-9a-fA-F]{3,8}\b/g,
      /rgba?\(/g,
    ],
  },
];

function classify(rel) {
  const norm = rel.replaceAll("\\", "/");
  if (norm.includes("/admin/")) return "ADMIN";
  if (norm.includes("/components/super-admin/") || norm.includes("/app/super-admin/")) return "ADMIN";
  // user-facing: apps/web/app/t/** (excluding admin), and common storefront components
  if (norm.startsWith("apps/web/app/t/")) return "USER";
  if (norm.startsWith("apps/web/components/checkout/")) return "USER";
  if (norm.startsWith("apps/web/components/profile/")) return "USER";
  if (norm.startsWith("apps/web/components/menu/")) return "USER";
  if (norm.startsWith("apps/web/components/ui/")) return "USER";
  if (norm.startsWith("apps/web/components/auth/")) return "USER";
  return "OTHER";
}

const results = []; // { fileRel, group, size, A,B,C,D,total }

for (const abs of files) {
  const rel = path.relative(repoRoot, abs).replaceAll(path.sep, "/");
  const content = readText(abs);
  if (!content) continue;

  const group = classify(rel);
  const size = Buffer.byteLength(content, "utf8");

  const row = { fileRel: rel, group, size, A: 0, B: 0, C: 0, D: 0, total: 0 };

  for (const b of BUCKETS) {
    let c = 0;
    for (const re of b.regexes) c += countRegex(content, re);
    if (b.postFilter) {
      const pf = b.postFilter(content);
      if (pf && typeof pf.subtract === "number") c = Math.max(0, c - pf.subtract);
    }
    row[b.key] = c;
  }

  row.total = row.A + row.B + row.C + row.D;
  if (row.total > 0) results.push(row);
}

function topN(group, n) {
  return results.filter(r => r.group === group).sort((a,b) => b.total - a.total).slice(0, n);
}

function printTop(title, arr) {
  console.log(title);
  if (arr.length === 0) {
    console.log("  (empty)");
    return;
  }
  for (const r of arr) {
    console.log(`- ${r.fileRel} — total ${r.total} (A:${r.A} B:${r.B} C:${r.C} D:${r.D})`);
  }
}

console.log("=== THEME AUDIT (deterministic scan) ===");
console.log("repoRoot:", repoRoot);
console.log("scanned:", files.length, "files");
console.log("matches:", results.length, "files with hits");
console.log("");

printTop("=== USER-FACING: Top 15 ===", topN("USER", 15));
console.log("");
printTop("=== ADMIN: Top 15 ===", topN("ADMIN", 15));
console.log("");

const uiHits = results
  .filter(r => r.group === "USER" && r.fileRel.startsWith("apps/web/components/ui/"))
  .sort((a,b) => (a.size - b.size) || (b.total - a.total))
  .slice(0, 5);

console.log("=== Quick wins: smallest apps/web/components/ui/** with hits (up to 5) ===");
if (uiHits.length === 0) {
  console.log("  (empty)");
} else {
  for (const r of uiHits) {
    console.log(`- ${r.fileRel} — total ${r.total} (A:${r.A} B:${r.B} C:${r.C} D:${r.D}) size=${r.size}B`);
  }
}
console.log("");

const smart = results.find(r => r.fileRel.endsWith("apps/web/components/checkout/SmartCheckout.tsx"));
console.log("=== SmartCheckout.tsx summary ===");
if (!smart) {
  console.log("  (no hits found / file not found in scan)");
} else {
  console.log(`- ${smart.fileRel} — total ${smart.total} (A:${smart.A} B:${smart.B} C:${smart.C} D:${smart.D})`);
}

console.log("");
console.log("=== END ===");
