'use client'

import { useSyncExternalStore, type ReactNode } from 'react'
import type { DayKind, TimeOfDay } from '@/lib/content/types'
import type { CityBundle, Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { bangkokNow } from '@/lib/explorer/when'
import { activeFilterCount, DAYS, EMPTY_FILTERS, isFullRange, PRICE_RANGE, TIMES, type FilterState, type PriceRange } from '@/lib/explorer/filters'
import { thb, usd } from '@/lib/explorer/price'
import { TransitFilter } from './transit-filter'
import { AreaFilter } from './area-filter'
import { StayPicker } from '@/components/stay/stay-picker'

export interface FilterPanelProps {
  locale: Locale
  bundle: CityBundle
  filters: FilterState
  onChange: (next: FilterState) => void
}

const subscribeNever = () => () => {}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/** The right-hand filter panel (a bottom sheet on phones), after Glaibaan's. The kind chips live in KindBar under the header. */
export function FilterPanel({ locale, bundle, filters, onChange }: FilterPanelProps) {
  // "Now in Bangkok": one tap picks the current time slot and day kind. The clock is read on the client only (the server snapshot is empty, so the chip appears once the page is live).
  const nowKey = useSyncExternalStore(subscribeNever, () => { const n = bangkokNow(); return `${n.time}/${n.day}` }, () => '')
  const now = nowKey ? { time: nowKey.split('/')[0] as TimeOfDay, day: nowKey.split('/')[1] as DayKind } : null
  const nowOn = !!now && filters.times.length === 1 && filters.times[0] === now.time && filters.days.length === 1 && filters.days[0] === now.day
  const s = strings(locale)
  const count = activeFilterCount(filters)
  return (
    <div className="flex flex-col gap-5 p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{s.filters.title}{count > 0 ? ` (${count})` : ''}</h2>
        {count > 0 && (
          <button type="button" onClick={() => onChange(EMPTY_FILTERS)} className="text-xs font-medium text-accent underline underline-offset-2">
            {s.filters.clearAll}
          </button>
        )}
      </div>

      <Section label={s.filters.areas}>
        <AreaFilter
          locale={locale}
          bundle={bundle}
          areas={filters.areas}
          subareas={filters.subareas}
          onChange={({ areas, subareas }) => onChange({ ...filters, areas, subareas })}
        />
      </Section>

      <Section label={s.filters.transit}>
        <TransitFilter
          locale={locale}
          bundle={bundle}
          stations={filters.stations}
          lines={filters.lines}
          onChange={({ stations, lines }) => onChange({ ...filters, stations, lines })}
        />
      </Section>

      <Section label={s.filters.when}>
        <div className="flex flex-wrap gap-1.5">
          {now && (
            <button type="button" aria-pressed={nowOn} onClick={() => onChange({ ...filters, times: nowOn ? [] : [now.time], days: nowOn ? [] : [now.day] })} className={`min-h-9 rounded-full border px-3 text-sm ${nowOn ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
              {s.filters.now(s.filters.time[now.time].toLowerCase())}
            </button>
          )}
          {TIMES.map((time) => {
            const on = filters.times.includes(time)
            return (
              <button key={time} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, times: toggle(filters.times, time) })} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
                {s.filters.time[time]}
              </button>
            )
          })}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DAYS.map((day) => {
            const on = filters.days.includes(day)
            return (
              <button key={day} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, days: toggle(filters.days, day) })} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
                {s.filters.day[day]}
              </button>
            )
          })}
        </div>
      </Section>
      <Section label={s.filters.price}>
        <PriceSlider locale={locale} value={filters.price} onChange={(price) => onChange({ ...filters, price })} />
      </Section>
      <Section label={s.stay.label}>
        <StayPicker locale={locale} bare />
      </Section>
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{label}</h3>
      {children}
    </section>
  )
}

/**
 * Two handles on one track: the lowest and highest price per night. Two
 * native range inputs sit on top of each other, so keyboards and screen
 * readers get the real control; the coloured band between them is drawn
 * with CSS from the two values. Null means the full range (off).
 */
function PriceSlider({ locale, value, onChange }: { locale: Locale; value: PriceRange | null; onChange: (r: PriceRange | null) => void }) {
  const s = strings(locale)
  const min = value?.min ?? PRICE_RANGE.min
  const max = value?.max ?? PRICE_RANGE.max
  const pct = (n: number) => ((n - PRICE_RANGE.min) / (PRICE_RANGE.max - PRICE_RANGE.min)) * 100
  const set = (next: PriceRange) => onChange(isFullRange(next) ? null : next)
  return (
    <div className="tm-range" style={{ ['--lo' as string]: `${pct(min)}%`, ['--hi' as string]: `${pct(max)}%` }}>
      <div className="tm-range__track">
        <input type="range" aria-label={s.filters.priceMin} min={PRICE_RANGE.min} max={PRICE_RANGE.max} step={PRICE_RANGE.step} value={min} onChange={(e) => set({ min: Math.min(Number(e.target.value), max - PRICE_RANGE.step), max })} />
        <input type="range" aria-label={s.filters.priceMax} min={PRICE_RANGE.min} max={PRICE_RANGE.max} step={PRICE_RANGE.step} value={max} onChange={(e) => set({ min, max: Math.max(Number(e.target.value), min + PRICE_RANGE.step) })} />
      </div>
      <p className="tm-range__value">
        <strong>{s.filters.priceRange(thb(min, locale), max >= PRICE_RANGE.max ? `${thb(max, locale)}+` : thb(max, locale))}</strong>
        <span>{s.filters.priceUsd(usd(min, locale), usd(max, locale))}</span>
      </p>
    </div>
  )
}
