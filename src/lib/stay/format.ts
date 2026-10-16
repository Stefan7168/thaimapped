import type { Locale } from '@/lib/content/types'

/** A date as "Sat, Nov 7" in the locale, from YYYY-MM-DD (noon local, so no time zone shifts the day). */
export function formatDay(date: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
}

/** Two dates as one range in the locale ("Sat, Nov 7 – Sun, Nov 8"), from YYYY-MM-DD. */
export function formatDayRange(from: string, to: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).formatRange(new Date(`${from}T12:00:00`), new Date(`${to}T12:00:00`))
}
