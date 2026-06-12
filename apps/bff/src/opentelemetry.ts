/*
 * 🔭 OpenTelemetry SDK Configuration
 * -----------------------------------------------------------------------------
 * This file defines the tracing configuration using the OpenTelemetry NodeSDK.
 * It is designed to be "clean" and robust, failing gracefully if disabled.
 * 
 * Usage: Imported by `instrumentation.ts` which is loaded via --import check
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { DiagConsoleLogger, DiagLogLevel, diag } from "@opentelemetry/api";

// 1. Diagnostics (Development / Debugging only)
// Enable only if specifically requested to avoid log spam
if (process.env.OTEL_DIAG_LEVEL) {
    diag.setLogger(new DiagConsoleLogger(), DiagLogLevel[process.env.OTEL_DIAG_LEVEL as keyof typeof DiagLogLevel] || DiagLogLevel.INFO);
}

// 2. Exporter Configuration (OTLP HTTP)
// Defaults to localhost:4318/v1/traces if not specified
const traceExporter = new OTLPTraceExporter({
    // Automatic Env Injection: OTEL_EXPORTER_OTLP_ENDPOINT
    // Default: http://localhost:4318/v1/traces
});

// 3. SDK Initialization
export const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [SEMRESATTRS_SERVICE_NAME]: "vendora-bff",
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]: process.env.NODE_ENV || "development",
    }),
    traceExporter,
    instrumentations: [
        getNodeAutoInstrumentations({
            // Disable noisy instrumentations if needed
            // (Optional tuning) @opentelemetry/instrumentation-fs: { enabled: false }
            "@opentelemetry/instrumentation-fs": { enabled: false },
        }),
    ],
});
