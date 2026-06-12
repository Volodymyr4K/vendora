export function resolveGoogleFontUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const candidate = raw.trim();
  if (!candidate.startsWith("https://fonts.googleapis.com/")) return null;
  return candidate;
}
