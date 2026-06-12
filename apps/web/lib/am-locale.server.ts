import "server-only";

import { cookies, headers } from "next/headers";
import { getAmLocaleCookieName, resolveAmLocale } from "./am-locale";

export async function getAmLocaleForTenant(tenantSlug: string) {
  const cookieStore = await cookies();
  const cookieName = getAmLocaleCookieName(tenantSlug);
  const cookieLocale = cookieStore.get(cookieName)?.value ?? null;
  const headerStore = await headers();
  const acceptLanguage = headerStore.get("accept-language");
  const { locale, shouldPersist } = resolveAmLocale({ cookieLocale, acceptLanguage });

  // For custom domains, tenant pages are served from `/...` (not `/t/<tenantSlug>/...`),
  // so the locale cookie must be readable site-wide.
  const urlKind = headerStore.get("x-url-kind");
  const cookiePath = urlKind === "domain" ? "/" : `/t/${tenantSlug}`;

  return {
    locale,
    shouldPersist,
    cookieName,
    cookiePath,
  };
}
