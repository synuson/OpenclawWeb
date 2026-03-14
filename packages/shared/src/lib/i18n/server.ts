import "server-only";

import { cookies } from "next/headers";
import { APP_LOCALE_COOKIE, DEFAULT_LOCALE, resolveAppLocale } from "@/lib/i18n/config";

export function getServerLocale() {
  return resolveAppLocale(cookies().get(APP_LOCALE_COOKIE)?.value ?? DEFAULT_LOCALE);
}
