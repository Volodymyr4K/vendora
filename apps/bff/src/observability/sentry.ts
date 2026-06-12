import * as Sentry from "@sentry/node";

export function initSentry(dsn?: string) {
  if (!dsn) return null;
  Sentry.init({
    dsn,
    tracesSampleRate: 0.05,
  });
  return Sentry;
}

export function captureError(err: unknown) {
  try {
    Sentry.captureException(err);
  } catch {
    // ignore
  }
}
