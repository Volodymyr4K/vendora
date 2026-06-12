/*
 * 🎻 Instrumentation Entry Point
 * -----------------------------------------------------------------------------
 * This file IS the entry point for OpenTelemetry.
 * It must be loaded BEFORE the application starts using the --import flag.
 * 
 * Example: `node --import ./dist/instrumentation.js dist/index.js`
 */

import { sdk } from "./opentelemetry.js";

// Start the SDK
// This runs synchronously-ish (initialization) but network start is async
sdk.start();

// eslint-disable-next-line no-console
console.log("🔭 [OpenTelemetry] SDK started successfully");

// Graceful shutdown on process exit
process.on("SIGTERM", () => {
    sdk
        .shutdown()
        // eslint-disable-next-line no-console
        .then(() => console.log("🔭 [OpenTelemetry] SDK shut down"))
        // eslint-disable-next-line no-console
        .catch((error) => console.log("🔭 [OpenTelemetry] Error shutting down", error))
        .finally(() => process.exit(0));
});
