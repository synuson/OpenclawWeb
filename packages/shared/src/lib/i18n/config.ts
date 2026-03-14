export const SUPPORTED_LOCALES = ["ko", "en"] as const;

export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: AppLocale = "ko";
export const APP_LOCALE_COOKIE = "openclawweb.locale";

export function isAppLocale(value: string | null | undefined): value is AppLocale {
  return SUPPORTED_LOCALES.includes(value as AppLocale);
}

export function resolveAppLocale(value: string | null | undefined): AppLocale {
  return isAppLocale(value) ? value : DEFAULT_LOCALE;
}

export function getIntlLocale(locale: AppLocale) {
  return locale === "ko" ? "ko-KR" : "en-US";
}

export function getSpeechLocale(locale: AppLocale) {
  return locale === "ko" ? "ko-KR" : "en-US";
}
