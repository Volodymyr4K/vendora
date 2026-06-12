export const AM_LOCALES = ["en", "de"] as const;
export type AmLocale = (typeof AM_LOCALES)[number];

export const AM_LOCALE_COOKIE_PREFIX = "am_locale";
export const AM_DEFAULT_LOCALE: AmLocale = "de";

function normalizeLocale(input: string | null | undefined): string | null {
  if (!input) return null;
  return input.trim().toLowerCase();
}

export function parseAcceptLanguage(header: string | null): AmLocale | null {
  const raw = normalizeLocale(header);
  if (!raw) return null;
  const parts = raw.split(",").map((part) => part.split(";")[0]?.trim());
  for (const part of parts) {
    if (!part) continue;
    const short = part.split("-")[0] || part;
    if (AM_LOCALES.includes(short as AmLocale)) return short as AmLocale;
  }
  return null;
}

export function resolveAmLocale(input: {
  cookieLocale?: string | null;
  acceptLanguage?: string | null;
}): { locale: AmLocale; shouldPersist: boolean } {
  const cookieLocale = normalizeLocale(input.cookieLocale) as AmLocale | null;
  if (cookieLocale && AM_LOCALES.includes(cookieLocale)) {
    return { locale: cookieLocale, shouldPersist: false };
  }

  const fromHeader = parseAcceptLanguage(input.acceptLanguage ?? null);
  if (fromHeader) {
    return { locale: fromHeader, shouldPersist: true };
  }

  return { locale: AM_DEFAULT_LOCALE, shouldPersist: true };
}

export function getAmLocaleCookieName(tenantSlug: string): string {
  const safe = tenantSlug.trim().toLowerCase();
  return `${AM_LOCALE_COOKIE_PREFIX}_${safe}`;
}
