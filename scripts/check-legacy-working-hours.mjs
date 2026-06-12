import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import ts from "typescript";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

// File extensions to check
const TS_EXTENSIONS = new Set(["ts", "tsx", "js", "jsx", "mjs"]);
const NON_TS_EXTENSIONS = new Set(["json", "prisma"]);

// Branch-related identifier patterns for hours detection
const BRANCH_IDENTIFIERS = new Set([
  "branch",
  "b",
  "config",
  "branchConfig",
  "branchCfg",
  "settings",
  "cfg",
  "data",
  "item",
]);

// Branch context keywords (for hours detection)
const BRANCH_CONTEXT_KEYWORDS = new Set([
  "workingSchedule",
  "Branch",
  "branchConfig",
  "branchCfg",
  "branchSettings",
  "BranchConfig",
  "BranchSettings",
  "tenant",
]);

function shouldExclude(filePath) {
  const relPath = path.relative(rootDir, filePath);
  const parts = relPath.split(path.sep);
  
  // Exclude patterns
  if (
    parts.includes("node_modules") ||
    parts.includes(".git") ||
    parts.includes("dist") ||
    parts.includes("build") ||
    parts.includes(".next") ||
    (parts.includes("prisma") && parts.includes("migrations")) ||
    relPath.endsWith(".md") ||
    relPath.endsWith("lint-results.json") ||
    relPath === "scripts/check-legacy-working-hours.mjs"
  ) {
    return true;
  }
  
  return false;
}

function findFiles(dir = rootDir, files = []) {
  const entries = readdirSync(dir, { withFileTypes: true });
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    
    if (shouldExclude(fullPath)) {
      continue;
    }
    
    if (entry.isDirectory()) {
      findFiles(fullPath, files);
    } else if (entry.isFile()) {
      const ext = path.extname(entry.name).slice(1);
      if (TS_EXTENSIONS.has(ext) || NON_TS_EXTENSIONS.has(ext)) {
        files.push(fullPath);
      }
    }
  }
  
  return files;
}

// Get line number from source file position
function getLineNumber(sourceFile, pos) {
  return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
}

// Get line snippet from source file
function getLineSnippet(sourceFile, pos) {
  const lineAndChar = sourceFile.getLineAndCharacterOfPosition(pos);
  const lineStart = sourceFile.getPositionOfLineAndCharacter(lineAndChar.line, 0);
  const lineEnd = sourceFile.getPositionOfLineAndCharacter(lineAndChar.line + 1, 0);
  return sourceFile.text.substring(lineStart, lineEnd).trim();
}

// Check if identifier is Branch-related
function isBranchIdentifier(name) {
  return BRANCH_IDENTIFIERS.has(name);
}

// Check if file has Branch context (for hours detection)
function hasBranchContext(sourceFile) {
  const text = sourceFile.text;
  for (const keyword of BRANCH_CONTEXT_KEYWORDS) {
    if (new RegExp(`\\b${keyword}\\b`).test(text)) {
      return true;
    }
  }
  return false;
}

// Check if hours is in Luxon context (e.g., .plus({ hours: 1 }))
function isLuxonHoursContext(node, sourceFile) {
  // Check if this is inside a CallExpression like .plus() or .minus()
  let parent = node.parent;
  while (parent) {
    if (ts.isCallExpression(parent)) {
      const expr = parent.expression;
      if (ts.isPropertyAccessExpression(expr)) {
        const name = expr.name.text;
        if (name === "plus" || name === "minus") {
          // Check if the hours is in the argument object literal
          if (parent.arguments.length > 0) {
            const arg = parent.arguments[0];
            if (ts.isObjectLiteralExpression(arg)) {
              return true;
            }
          }
        }
      }
    }
    parent = parent.parent;
  }
  return false;
}

// Get property name from expression
function getPropertyName(node) {
  if (ts.isIdentifier(node)) {
    return node.text;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return null;
}

// Fallback regex check for parse errors (fail-closed)
function checkTSFileRegexFallback(filePath, content) {
  const lines = content.split("\n");
  const matches = [];
  
  // Minimal regex patterns for openTime/closeTime/hours
  const patterns = [
    {
      regex: /\.(openTime|closeTime)\b/g,
      name: "member access (fallback)",
    },
    {
      regex: /\[["'`](openTime|closeTime)["'`]\]/g,
      name: "bracket access (fallback)",
    },
    {
      regex: /["'`](openTime|closeTime)["'`]\s*:/g,
      name: "object key (fallback)",
    },
    {
      regex: /\b(branch|b|config|branchConfig|settings|cfg|data|item)\.hours\b/g,
      name: "property access (Branch-related, fallback)",
    },
    {
      regex: /"(hours)":/g,
      name: "object key (fallback)",
    },
    {
      regex: /\b(hours)\s*:/g,
      name: "object key (unquoted, fallback)",
    },
  ];
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      
      matches.push({
        pattern: pattern.name,
        line: lineNum,
        snippet: line,
        match: match[0],
      });
    }
  }
  
  return matches;
}

// Scan TypeScript/JavaScript file using AST
function checkTSFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  let sourceFile;
  
  try {
    sourceFile = ts.createSourceFile(
      filePath,
      content,
      ts.ScriptTarget.Latest,
      true
    );
  } catch {
    // If createSourceFile fails, use regex fallback (fail-closed)
    const fallbackMatches = checkTSFileRegexFallback(filePath, content);
    if (fallbackMatches.length > 0) {
      return fallbackMatches.map((m) => ({
        ...m,
        pattern: `${m.pattern} (parse exception fallback)`,
      }));
    }
    return [];
  }
  
  const matches = [];
  const hasBranchCtx = hasBranchContext(sourceFile);
  
  function visit(node) {
    // Check PropertyAccessExpression: *.openTime, *.closeTime, or Branch-related *.hours
    if (ts.isPropertyAccessExpression(node)) {
      const propName = node.name.text;
      
      if (propName === "openTime" || propName === "closeTime") {
        const line = getLineNumber(sourceFile, node.getStart());
        const snippet = getLineSnippet(sourceFile, node.getStart());
        matches.push({
          pattern: "member access",
          line,
          snippet,
          match: `.${propName}`,
        });
      } else if (propName === "hours") {
        // Check if the expression is Branch-related
        const expr = node.expression;
        if (ts.isIdentifier(expr)) {
          const identifierName = expr.text;
          if (isBranchIdentifier(identifierName)) {
            const line = getLineNumber(sourceFile, node.getStart());
            const snippet = getLineSnippet(sourceFile, node.getStart());
            matches.push({
              pattern: "property access (Branch-related)",
              line,
              snippet,
              match: `${identifierName}.hours`,
            });
          }
        }
      }
    }
    
    // Check ElementAccessExpression: *["openTime"], *['closeTime'], *[`openTime`]
    if (ts.isElementAccessExpression(node)) {
      const propName = getPropertyName(node.argumentExpression);
      if (propName === "openTime" || propName === "closeTime") {
        const line = getLineNumber(sourceFile, node.getStart());
        const snippet = getLineSnippet(sourceFile, node.getStart());
        matches.push({
          pattern: "bracket access",
          line,
          snippet,
          match: `["${propName}"]`,
        });
      }
    }
    
    // Check ObjectLiteralExpression keys: openTime:, "openTime":, 'closeTime':, `closeTime`:
    if (ts.isObjectLiteralExpression(node)) {
      for (const prop of node.properties) {
        if (ts.isPropertyAssignment(prop) || ts.isShorthandPropertyAssignment(prop)) {
          let keyName = null;
          
          if (ts.isIdentifier(prop.name)) {
            keyName = prop.name.text;
          } else if (ts.isStringLiteral(prop.name) || ts.isNoSubstitutionTemplateLiteral(prop.name)) {
            keyName = prop.name.text;
          }
          
          if (keyName === "openTime" || keyName === "closeTime") {
            const line = getLineNumber(sourceFile, prop.getStart());
            const snippet = getLineSnippet(sourceFile, prop.getStart());
            matches.push({
              pattern: "object key",
              line,
              snippet,
              match: `${keyName}:`,
            });
          } else if (keyName === "hours") {
            // For hours, only flag if in Branch context and not Luxon
            if (hasBranchCtx && !isLuxonHoursContext(prop, sourceFile)) {
              const line = getLineNumber(sourceFile, prop.getStart());
              const snippet = getLineSnippet(sourceFile, prop.getStart());
              matches.push({
                pattern: "object key (Branch context)",
                line,
                snippet,
                match: `${keyName}:`,
              });
            }
          }
        }
      }
    }
    
    ts.forEachChild(node, visit);
  }
  
  visit(sourceFile);
  return matches;
}

// Check non-TS files (JSON, Prisma) with minimal regex
function checkNonTSFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  const matches = [];
  
  // Only check for openTime/closeTime in non-TS files (hours is too ambiguous)
  const patterns = [
    {
      regex: /\.(openTime|closeTime)\b/g,
      name: "member access",
    },
    {
      regex: /\[["'`](openTime|closeTime)["'`]\]/g,
      name: "bracket access",
    },
    {
      regex: /["'`](openTime|closeTime)["'`]\s*:/g,
      name: "object key",
    },
  ];
  
  for (const pattern of patterns) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let match;
    
    while ((match = regex.exec(content)) !== null) {
      const lineNum = content.substring(0, match.index).split("\n").length;
      const line = lines[lineNum - 1]?.trim() || "";
      
      matches.push({
        pattern: pattern.name,
        line: lineNum,
        snippet: line,
        match: match[0],
      });
    }
  }
  
  return matches;
}

function checkFile(filePath) {
  const ext = path.extname(filePath).slice(1);
  
  if (TS_EXTENSIONS.has(ext)) {
    try {
      return checkTSFile(filePath);
    } catch (error) {
      // If AST parsing fails catastrophically, fail-closed with regex fallback
      const content = readFileSync(filePath, "utf-8");
      const fallbackMatches = checkTSFileRegexFallback(filePath, content);
      if (fallbackMatches.length > 0) {
        return fallbackMatches.map((m) => ({
          ...m,
          pattern: `${m.pattern} (parse exception fallback)`,
        }));
      }
      // If no matches, still log warning but don't fail
      console.warn(`Warning: Failed to parse ${filePath} with AST: ${error.message}`);
      return [];
    }
  } else if (NON_TS_EXTENSIONS.has(ext)) {
    return checkNonTSFile(filePath);
  }
  
  return [];
}

function main() {
  console.log("Checking for legacy working-hours fields (hours/openTime/closeTime)...\n");
  
  const files = findFiles();
  console.log(`Scanning ${files.length} files...\n`);
  
  const allMatches = [];
  
  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    
    // Progress logging every 25 files
    if (i > 0 && i % 25 === 0) {
      const relPath = path.relative(rootDir, file);
      console.log(`[${i}/${files.length}] ${relPath}`);
    }
    
    const matches = checkFile(file);
    if (matches.length > 0) {
      const relPath = path.relative(rootDir, file);
      for (const match of matches) {
        allMatches.push({
          file: relPath,
          ...match,
        });
      }
    }
  }

  if (allMatches.length === 0) {
    console.log("✓ No legacy working-hours fields found.\n");
    process.exit(0);
  }

  console.error("✗ Found legacy working-hours field references:\n");
  
  for (const match of allMatches) {
    console.error(
      `  ${match.file}:${match.line} (${match.pattern}: ${match.match})`
    );
    console.error(`    ${match.snippet}`);
    console.error("");
  }

  console.error(
    `\nTotal: ${allMatches.length} match(es) across ${new Set(allMatches.map((m) => m.file)).size} file(s)\n`
  );
  process.exit(1);
}

main();
