import type { Locale, Localized } from '@/lib/content/types'

/** English only at launch. The list grows without touching URLs or content shape. */
export const LOCALES: Locale[] = ['en']
export const DEFAULT_LOCALE: Locale = 'en'

export function isLocale(value: string): value is Locale {
  return (LOCALES as string[]).includes(value)
}

/** Localized content string with English fallback. */
export function t(value: Localized, locale: Locale): string {
  return value[locale] ?? value.en
}
