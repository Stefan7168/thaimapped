'use client'

import { BedDouble, Landmark, Martini, ShoppingBag, Utensils, X } from 'lucide-react'
import type { CityBundle, Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { KIND_CHIPS, visiblePins, type FilterState } from '@/lib/explorer/filters'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

const ICONS = { hotel: BedDouble, sight: Landmark, food: Utensils, market: ShoppingBag, nightlife: Martini } as const

/**
 * The second bar under the header: what to show, as chips. Each chip carries
 * its icon and how many places it would show with the other filters as they
 * are; a picked chip is tinted, outlined and ends in an x to unpick it.
 * Scrolls sideways on phones.
 */
export function KindBar({ locale, bundle, filters, onChange }: { locale: Locale; bundle: CityBundle; filters: FilterState; onChange: (next: FilterState) => void }) {
  const s = strings(locale)
  return (
    <div className="flex items-center gap-2 overflow-x-auto border-b border-line bg-paper px-3 py-2 md:px-4">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.filters.kinds}</span>
      {KIND_CHIPS.map((k) => {
        const on = filters.kinds.includes(k)
        const Icon = ICONS[k as keyof typeof ICONS]
        const count = visiblePins(bundle, { ...filters, kinds: [k] }).length
        return (
          <button key={k} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, kinds: toggle(filters.kinds, k) })} className={`tm-kind${on ? ' tm-kind--on' : ''}`}>
            <span className="tm-kind__icon"><Icon aria-hidden="true" className="size-4" /></span>
            {s.pin[k]}
            <span className="tm-kind__count">{count}</span>
            {on && <X aria-hidden="true" className="tm-kind__x size-4" />}
          </button>
        )
      })}
    </div>
  )
}
