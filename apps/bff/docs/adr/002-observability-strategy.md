# ADR-002: Observability Strategy (Safe Tracing)

## Status
Accepted

## Date
2026-01-17

## Context
We need deep visibility into the critical "Checkout" and "Order" flows to debug issues in production. However, adding tracing code carries risks:
1.  **Performance:** Overhead of span creation.
2.  **Stability:** If the tracing library fails or throws, it must not crash the user's request.
3.  **Memory Leaks:** Open spans that are never closed (due to errors) cause memory leaks.

## Decision
We adopted **OpenTelemetry** with a strict **"Safe Wrap" Pattern**.

### The Pattern
All manual tracing MUST use `try/finally` blocks ensuring `span.end()` is always called.

```typescript
// ✅ APPROVED PATTERN
return tracer.startActiveSpan('operation', async (span) => {
  try {
    // ... logic ...
    return result;
  } catch (err) {
    span.recordException(err);
    throw err; // Re-throw to let Fastify handle the error
  } finally {
    span.end(); // Guaranteed cleanup
  }
});
```

### Infrastructure
*   **Initialization:** Done via `instrumentation.ts` loaded with `--import` (or direct import in dev).
*   **Exporter:** OTLP (Protocol Buffers) over HTTP.
*   **Resource Attributes:** `service.name`, `tenant.id` (where applicable).

## Consequences

### Positive
*   **Safety:** The application remains stable even if tracing encounters errors (swallowed safely or cleaned up).
*   **Standards:** Uniform tracing across all domains.
*   **Debuggability:** Full trace distributed availability.

### Negative
*   **Verbosity:** Writing the wrapper code adds indentation and lines of code.
