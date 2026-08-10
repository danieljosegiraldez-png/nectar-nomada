export const locales = ["es", "en"] as const;
export type AppLocale = (typeof locales)[number];

// CLAUDE.md §41 — Spanish and English are first-class, Spanish stated first
// as the priority language; used as the fallback whenever the browser's
// preference is missing or ambiguous.
export const defaultLocale: AppLocale = "es";

export const LOCALE_COOKIE = "NEXT_LOCALE";

export function isAppLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (locales as readonly string[]).includes(value);
}

/**
 * Minimal Accept-Language parsing — good enough for a two-locale app. Not a
 * full BCP 47 negotiator; picks the first tag and checks its primary
 * subtag against "en". Anything else, including a missing/malformed
 * header, falls back to defaultLocale per CLAUDE.md §41.
 */
export function localeFromAcceptLanguage(acceptLanguage: string | null | undefined): AppLocale {
  const firstTag = acceptLanguage?.split(",")[0]?.trim().toLowerCase();
  if (firstTag?.startsWith("en")) return "en";
  return defaultLocale;
}
