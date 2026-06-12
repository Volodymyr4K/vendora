import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { loadConfig } from "../config.js";
import { createUpstream, type UpstreamContext } from "../services/upstream.js";
import { fetchJson } from "../services/http.js";

function firstHeader(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

async function main() {
  let server: ReturnType<typeof createServer> | null = null;
  let capturedTenantSlug: string | undefined;
  let capturedRequestId: string | undefined;
  let requestCount = 0;

  try {
    // Create in-process fake upstream HTTP server
    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      requestCount++;
      // Node.js normalizes headers to lowercase
      capturedTenantSlug = firstHeader(req.headers["x-tenant-slug"]);
      capturedRequestId = firstHeader(req.headers["x-request-id"]);

      if (req.method === "GET" && req.url === "/branches") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify([{ slug: "smoke", cityName: "Smoke" }]));
      } else {
        res.writeHead(404, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: "Not found" }));
      }
    });

    // Start server on random port (0 = OS-assigned)
    await new Promise<void>((resolve, reject) => {
      server!.listen(0, "127.0.0.1", () => {
        resolve();
      });
      server!.on("error", reject);
    });

    // Get assigned port
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Server address is not an object (unexpected)");
    }
    const port = address.port;
    const baseUrl = `http://127.0.0.1:${port}`;

    // Build isolated env object (DO NOT read/spread/mutate process.env)
    const env: NodeJS.ProcessEnv = {
      UPSTREAM_MODE: "http",
      UPSTREAM_BASE_URL: baseUrl,
      UPSTREAM_HEADERS_JSON: "{}",
      UPSTREAM_ENDPOINTS_JSON: "{}",
      DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/vendora_smoke?schema=public",
      INTERNAL_API_SECRET: "0123456789abcdef0123456789abcdef",
    };

    // Load config and create upstream
    const cfg = loadConfig(env);
    const upstream = createUpstream(cfg);

    // Create test context
    const ctx: UpstreamContext = {
      tenantId: "00000000-0000-0000-0000-000000000000",
      tenantSlug: "tenant-a",
      requestId: "smoke-req-1",
    };

    // Call getBranches
    const out = await upstream.getBranches(ctx);

    // Assertions
    const expected = [{ slug: "smoke", cityName: "Smoke" }];
    if (JSON.stringify(out) !== JSON.stringify(expected)) {
      throw new Error(
        `Response mismatch: expected ${JSON.stringify(expected)}, got ${JSON.stringify(out)}`
      );
    }

    if (capturedTenantSlug !== "tenant-a") {
      throw new Error(
        `x-tenant-slug header mismatch: expected "tenant-a", got "${capturedTenantSlug}"`
      );
    }

    if (capturedRequestId !== "smoke-req-1") {
      throw new Error(
        `x-request-id header mismatch: expected "smoke-req-1", got "${capturedRequestId}"`
      );
    }

    // Test: reserved header override protection
    const before = requestCount;
    capturedTenantSlug = undefined;
    capturedRequestId = undefined;
    await fetchJson(
      `${baseUrl}/branches`,
      {
        timeoutMs: 5000,
        retries: 0,
        backoffMs: 100,
        headers: { "x-tenant-slug": "tenant-a" },
        requestId: "smoke-req-override"
      },
      {
        headers: {
          "x-tenant-slug": "OVERRIDE-ATTEMPT",
          "x-request-id": "OVERRIDE-ATTEMPT"
        }
      }
    );
    if (requestCount !== before + 1) {
      throw new Error(
        `Expected 1 HTTP request for override test, but requestCount changed by ${requestCount - before}`
      );
    }
    if (capturedTenantSlug === undefined) {
      throw new Error("capturedTenantSlug is undefined after override test");
    }
    if (capturedRequestId === undefined) {
      throw new Error("capturedRequestId is undefined after override test");
    }
    if (capturedTenantSlug !== "tenant-a") {
      throw new Error(
        `x-tenant-slug override not blocked: expected "tenant-a", got "${capturedTenantSlug}"`
      );
    }
    if (capturedRequestId !== "smoke-req-override") {
      throw new Error(
        `x-request-id override not blocked: expected "smoke-req-override", got "${capturedRequestId}"`
      );
    }

    // Test: missing tenantSlug should be rejected BEFORE HTTP request
    const requestCountBeforeMissingTest = requestCount;
    const missingCtx = {
      tenantId: "00000000-0000-0000-0000-000000000000",
      tenantSlug: undefined,
      requestId: "smoke-req-missing",
    } as unknown as UpstreamContext;
    try {
      await upstream.getBranches(missingCtx);
      throw new Error("Expected getBranches with missing tenantSlug to throw");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Missing tenantSlug")) {
        throw new Error(
          `Expected "Missing tenantSlug" error, got: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    if (requestCount !== requestCountBeforeMissingTest) {
      throw new Error(
        `Expected 0 HTTP requests for missing tenantSlug, but ${requestCount - requestCountBeforeMissingTest} request(s) were sent`
      );
    }

    // Test: whitespace-only tenantSlug should be rejected BEFORE HTTP request
    const requestCountBeforeWhitespaceTest = requestCount;
    const whitespaceCtx: UpstreamContext = {
      tenantId: "00000000-0000-0000-0000-000000000000",
      tenantSlug: "   ",
      requestId: "smoke-req-2",
    };
    try {
      await upstream.getBranches(whitespaceCtx);
      throw new Error("Expected getBranches with whitespace-only tenantSlug to throw");
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("Missing tenantSlug")) {
        throw new Error(
          `Expected "Missing tenantSlug" error, got: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    if (requestCount !== requestCountBeforeWhitespaceTest) {
      throw new Error(
        `Expected 0 HTTP requests for whitespace-only tenantSlug, but ${requestCount - requestCountBeforeWhitespaceTest} request(s) were sent`
      );
    }

    console.log("✅ HTTP upstream smoke test passed");
  } catch (error) {
    console.error("❌ HTTP upstream smoke test failed:", error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  } finally {
    // MUST close server to prevent port leaks
    if (server) {
      await new Promise<void>((resolve) => {
        server!.close(() => {
          resolve();
        });
      });
    }
  }
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
