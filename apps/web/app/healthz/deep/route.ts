import { getBffBaseUrl } from "../../../lib/bffBase";

export const runtime = "nodejs";

function withTimeout(ms: number): AbortSignal {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), ms);
  // Prevent the timer from keeping the event loop alive.
  const timer = t as unknown as { unref?: () => void };
  if (typeof timer.unref === "function") timer.unref();
  return controller.signal;
}

function parseTenantMap(raw: string | undefined): { ok: true; domains: number } | { ok: false; error: string } {
  const value = raw ?? "{}";
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false, error: "TENANT_BY_DOMAIN_JSON must be a JSON object" };
    }
    return { ok: true, domains: Object.keys(parsed as Record<string, unknown>).length };
  } catch (e) {
    return { ok: false, error: `TENANT_BY_DOMAIN_JSON invalid JSON: ${(e as Error)?.message || String(e)}` };
  }
}

export async function GET() {
  const startedAt = Date.now();

  const tenantMap = parseTenantMap(process.env.TENANT_BY_DOMAIN_JSON);
  if (!tenantMap.ok) {
    return Response.json(
      {
        status: "error",
        service: "vendora-web",
        timestamp: new Date().toISOString(),
        checks: { tenantMap },
        durationMs: Date.now() - startedAt,
      },
      { status: 500 },
    );
  }

  const bffBase = getBffBaseUrl();
  const bffUrl = `${bffBase}/health`;

  try {
    const res = await fetch(bffUrl, {
      method: "GET",
      signal: withTimeout(1500),
      headers: { accept: "application/json" },
    });
    const text = await res.text();
    const ok = res.ok;

    let body: unknown = undefined;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = text;
    }

    if (!ok) {
      return Response.json(
        {
          status: "degraded",
          service: "vendora-web",
          timestamp: new Date().toISOString(),
          checks: {
            tenantMap,
            bff: { ok: false, status: res.status, url: bffUrl, body },
          },
          durationMs: Date.now() - startedAt,
        },
        { status: 503 },
      );
    }

    return Response.json({
      status: "ok",
      service: "vendora-web",
      timestamp: new Date().toISOString(),
      checks: {
        tenantMap,
        bff: { ok: true, status: res.status, url: bffUrl, body },
      },
      durationMs: Date.now() - startedAt,
    });
  } catch (e) {
    const message = (e as Error)?.name === "AbortError" ? "timeout" : ((e as Error)?.message || String(e));
    return Response.json(
      {
        status: "degraded",
        service: "vendora-web",
        timestamp: new Date().toISOString(),
        checks: {
          tenantMap,
          bff: { ok: false, url: bffUrl, error: message },
        },
        durationMs: Date.now() - startedAt,
      },
      { status: 503 },
    );
  }
}
