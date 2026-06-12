const cache = new Map<string, boolean>();

export function isValidTimezone(tz: string): boolean {
  const key = tz.trim();
  if (key.length === 0) return false;

  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  let ok = false;
  try {
    // throws RangeError on invalid IANA tz
    new Intl.DateTimeFormat("en-US", { timeZone: key }).format(new Date(0));
    ok = true;
  } catch {
    ok = false;
  }

  cache.set(key, ok);
  return ok;
}
