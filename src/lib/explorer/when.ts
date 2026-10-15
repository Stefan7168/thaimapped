import type { Locale, Pin } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { t } from '@/lib/i18n/locales'

/** One line for a card or row: the note if there is one, else "Best evening, night · Weekend only". */
export function whenLine(pin: Pin, locale: Locale): string | null {
  if (!pin.when) return null
  if (pin.when.note) return t(pin.when.note, locale)
  const s = strings(locale)
  const parts = [s.card.bestAt(pin.when.times.map((x) => s.filters.time[x].toLowerCase()).join(', '))]
  if (pin.when.days) parts.push(s.card.onlyOn(pin.when.days.map((d) => s.filters.day[d]).join(', ')))
  return parts.join(' · ')
}

/** The When slot it is right now in Bangkok: morning 05 to 11, afternoon 11 to 17, evening 17 to 21, night otherwise. */
export function bangkokNow(now = new Date()): { time: 'morning' | 'afternoon' | 'evening' | 'night'; day: 'weekday' | 'weekend' } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', hour: 'numeric', hour12: false, weekday: 'short' }).formatToParts(now)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 12) % 24
  const weekday = parts.find((p) => p.type === 'weekday')?.value ?? 'Mon'
  const time = hour >= 5 && hour < 11 ? 'morning' : hour >= 11 && hour < 17 ? 'afternoon' : hour >= 17 && hour < 21 ? 'evening' : 'night'
  return { time, day: weekday === 'Sat' || weekday === 'Sun' ? 'weekend' : 'weekday' }
}
