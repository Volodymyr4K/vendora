import "dotenv/config";
import { loadConfig } from "../config.js";

async function main() {
  // Check UPSTREAM_MODE
  if (process.env.UPSTREAM_MODE !== "http") {
    console.log("SKIP (UPSTREAM_MODE!=http)");
    process.exit(0);
  }

  // Check UPSTREAM_BASE_URL
  if (!process.env.UPSTREAM_BASE_URL) {
    console.log("SKIP (missing UPSTREAM_BASE_URL)");
    process.exit(0);
  }

  // Check RUN_UPSTREAM_CONTRACT_SMOKE
  if (process.env.RUN_UPSTREAM_CONTRACT_SMOKE !== "true") {
    console.log("SKIP (set RUN_UPSTREAM_CONTRACT_SMOKE=true)");
    process.exit(0);
  }

  // Load config to get endpoint path
  const cfg = loadConfig(process.env);
  const baseUrl = cfg.UPSTREAM_BASE_URL?.replace(/\/$/, "") || "";
  const endpointPath = cfg.upstreamEndpoints.branches;
  const url = `${baseUrl}${endpointPath}`;

  // Test a) missing x-tenant-slug -> expect status 400 or 401 (NOT 2xx)
  try {
    const responseA = await fetch(url, {
      method: "GET",
      headers: {},
    });
    if (responseA.status >= 200 && responseA.status < 300) {
      const bodyText = await responseA.text();
      const bodySnippet = bodyText.slice(0, 200);
      throw new Error(
        `Check a) failed: missing x-tenant-slug returned ${responseA.status} (expected 400 or 401). Response: ${bodySnippet}`
      );
    }
    if (responseA.status !== 400 && responseA.status !== 401) {
      const bodyText = await responseA.text();
      const bodySnippet = bodyText.slice(0, 200);
      throw new Error(
        `Check a) failed: missing x-tenant-slug returned ${responseA.status} (expected 400 or 401). Response: ${bodySnippet}`
      );
    }
    console.log("✅ Check a) passed: missing x-tenant-slug rejected");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Check a) failed")) {
      throw error;
    }
    const bodySnippet = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
    throw new Error(`Check a) failed: ${error instanceof Error ? error.message : String(error)}. Response: ${bodySnippet}`);
  }

  // Test b) x-tenant-slug = "   " -> expect status 400 or 401 (NOT 2xx)
  try {
    const responseB = await fetch(url, {
      method: "GET",
      headers: {
        "x-tenant-slug": "   ",
      },
    });
    if (responseB.status >= 200 && responseB.status < 300) {
      const bodyText = await responseB.text();
      const bodySnippet = bodyText.slice(0, 200);
      throw new Error(
        `Check b) failed: blank x-tenant-slug returned ${responseB.status} (expected 400 or 401). Response: ${bodySnippet}`
      );
    }
    if (responseB.status !== 400 && responseB.status !== 401) {
      const bodyText = await responseB.text();
      const bodySnippet = bodyText.slice(0, 200);
      throw new Error(
        `Check b) failed: blank x-tenant-slug returned ${responseB.status} (expected 400 or 401). Response: ${bodySnippet}`
      );
    }
    console.log("✅ Check b) passed: blank x-tenant-slug rejected");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Check b) failed")) {
      throw error;
    }
    const bodySnippet = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
    throw new Error(`Check b) failed: ${error instanceof Error ? error.message : String(error)}. Response: ${bodySnippet}`);
  }

  // Test c) x-tenant-slug = "tenant-a" and x-request-id = "contract-smoke-1" -> expect 2xx
  try {
    const responseC = await fetch(url, {
      method: "GET",
      headers: {
        "x-tenant-slug": "tenant-a",
        "x-request-id": "contract-smoke-1",
      },
    });
    if (responseC.status < 200 || responseC.status >= 300) {
      const bodyText = await responseC.text();
      const bodySnippet = bodyText.slice(0, 200);
      throw new Error(
        `Check c) failed: valid headers returned ${responseC.status} (expected 2xx). Response: ${bodySnippet}`
      );
    }
    console.log("✅ Check c) passed: valid headers accepted");
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Check c) failed")) {
      throw error;
    }
    const bodySnippet = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
    throw new Error(`Check c) failed: ${error instanceof Error ? error.message : String(error)}. Response: ${bodySnippet}`);
  }

  console.log("✅ All upstream HTTP contract smoke tests passed");
}

main().catch((error) => {
  console.error("❌ Upstream HTTP contract smoke test failed:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
