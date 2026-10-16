'use client'

import type { Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { useSaved } from '@/lib/saved/store'

/** On the station index: " · Your hotel" after a row when one of that station's hotels is on the reader's list. Nothing on the server. */
export function YourHotelTag({ locale, hotelIds }: { locale: Locale; hotelIds: string[] }) {
  const saved = useSaved()
  if (!hotelIds.some((id) => saved.includes(id))) return null
  return <span className="tm-st__mine"> · {strings(locale).saved.cmpMine}</span>
}
