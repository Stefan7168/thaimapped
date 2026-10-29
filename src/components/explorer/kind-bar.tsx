'use client'

import { BedDouble, Landmark, LocateFixed, Martini, ShoppingBag, TrainFront, Utensils, X } from 'lucide-react'
import type { CityBundle, Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { KIND_CHIPS, visiblePins, type FilterState } from '@/lib/explorer/filters'

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/** One icon per kind, shared with the list thumbnails' placeholder. */
export const KIND_ICONS = { hotel: BedDouble, sight: Landmark, food: Utensils, market: ShoppingBag, nightlife: Martini, transport: TrainFront } as const

/**
 * The second bar under the header: what to show, as chips. Each chip carries
 * its icon and how many places it would show with the other filters as they
 * are; a picked chip is tinted, outlined and ends in an x to unpick it.
 * Scrolls sideways on phones.
 */
export function KindBar({ locale, bundle, filters, onChange, onNear, locating = false, hotel = null }: { locale: Locale; bundle: CityBundle; filters: FilterState; onChange: (next: FilterState) => void; onNear?: () => void; locating?: boolean; hotel?: { name: string; lon: number; lat: number } | null }) {
  const s = strings(locale)
  return (
    <section aria-label={s.filters.kinds} className="flex items-center gap-2 overflow-x-auto border-b border-line bg-paper px-3 py-2 md:px-4">
      <span className="shrink-0 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.filters.kinds}</span>
      {KIND_CHIPS.map((k) => {
        const on = filters.kinds.includes(k)
        const Icon = KIND_ICONS[k]
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
      {onNear && (() => {
        const nearMe = !!filters.near && !filters.nearName
        return (
          <button type="button" aria-pressed={nearMe} aria-busy={locating} onClick={() => (nearMe ? onChange({ ...filters, near: null, nearName: null }) : onNear())} className={`tm-kind tm-kind--near${nearMe ? ' tm-kind--on' : ''}`}>
            <span className="tm-kind__icon"><LocateFixed aria-hidden="true" className="size-4" /></span>
            {locating ? s.near.locating : s.near.chip}
            {nearMe && <X aria-hidden="true" className="tm-kind__x size-4" />}
          </button>
        )
      })()}
      {/* The saved hotel as the centre: the same walk circle and minutes, around its door instead of the visitor. */}
      {hotel && (() => {
        const on = !!filters.near && filters.nearName === hotel.name
        return (
          <button type="button" aria-pressed={on} onClick={() => onChange(on ? { ...filters, near: null, nearName: null } : { ...filters, areas: [], subareas: [], stations: [], lines: [], near: [hotel.lon, hotel.lat], nearName: hotel.name })} className={`tm-kind tm-kind--near${on ? ' tm-kind--on' : ''}`} title={hotel.name}>
            <span className="tm-kind__icon"><BedDouble aria-hidden="true" className="size-4" /></span>
            {s.near.hotelChip}
            {on && <X aria-hidden="true" className="tm-kind__x size-4" />}
          </button>
        )
      })()}
    </section>
  )
}
