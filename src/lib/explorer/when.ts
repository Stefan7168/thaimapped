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
