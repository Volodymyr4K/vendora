import { zDeliveryFallback, zDeliveryResponse } from "@vendora/contracts";
import { toNumber, unwrap, SafeRecord } from "./util.js";

export type NormalizeOpts = { unwrapKeys: string[] };

function pickAny(obj: unknown, keys: string[]) {
  const rec = obj as SafeRecord;
  for (const k of keys) {
    const v = rec?.[k];
    if (v !== undefined && v !== null) return v;
  }
  return undefined;
}

export function normalizeDelivery(rawInput: unknown, opts: NormalizeOpts) {
  const raw0 = unwrap(rawInput, opts.unwrapKeys);

  // If already valid response
  const ok = zDeliveryResponse.safeParse(raw0);
  if (ok.success) return ok.data;

  const rec0 = raw0 as SafeRecord;
  const data = rec0?.data as SafeRecord | undefined;
  // Use explicit casting to SafeRecord for access
  const cfg = ((rec0?.cfg ?? rec0?.delivery ?? data?.delivery ?? raw0) || {}) as SafeRecord;

  const deliveryFee = toNumber(pickAny(cfg, ["deliveryFee", "fee", "price", "cost"])) ?? 0;
  const freeFrom = toNumber(pickAny(cfg, ["freeFrom", "free_from", "freeDeliveryFrom", "free", "minFree"])) ?? 0;
  const etaMin = Math.max(1, Math.floor(toNumber(pickAny(cfg, ["etaMin", "eta_min", "minEta", "min", "minMinutes"])) ?? 45));
  const etaMax = Math.max(etaMin, Math.floor(toNumber(pickAny(cfg, ["etaMax", "eta_max", "maxEta", "max", "maxMinutes"])) ?? 75));
  const zones = Array.isArray(cfg?.zones) ? cfg.zones.map(String) : [];

  // Validate via the union response schema (ok|fallback) to avoid relying on a specific named export
  const candidate = { mode: "ok" as const, cfg: { deliveryFee, freeFrom, etaMin, etaMax, zones } };
  const parsed = zDeliveryResponse.safeParse(candidate);
  if (parsed.success) return parsed.data;

  return zDeliveryFallback.parse({
    mode: "fallback",
    message: "Please confirm delivery terms with the venue.",
  });
}
