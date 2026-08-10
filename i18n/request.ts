import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, isAppLocale, localeFromAcceptLanguage, LOCALE_COOKIE } from "./config";

/**
 * No URL-based i18n routing (no `/en`/`/es` prefix) — content itself isn't
 * translated yet (MVP_ROADMAP.md §3, deliberately deferred), so there is no
 * per-locale content to route to. Locale is resolved per request from:
 *
 *   1. the `NEXT_LOCALE` cookie, set explicitly by the locale switcher and,
 *      for signed-in users, at login time from their persisted
 *      `Person.locale` (DOMAIN_MODEL.md §1) — see app/actions/auth.ts and
 *      app/actions/locale.ts;
 *   2. otherwise the browser's Accept-Language header;
 *   3. otherwise defaultLocale (Spanish, CLAUDE.md §41).
 */
export default getRequestConfig(async () => {
  const cookieStore = await cookies();
  const cookieLocale = cookieStore.get(LOCALE_COOKIE)?.value;

  const locale = isAppLocale(cookieLocale)
    ? cookieLocale
    : localeFromAcceptLanguage((await headers()).get("accept-language")) ?? defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
