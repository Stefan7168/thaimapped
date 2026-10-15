'use client'

import type { ReactNode } from 'react'
import type { CityBundle, Locale } from '@/lib/content/types'
import { strings } from '@/lib/i18n/strings'
import { activeFilterCount, DAYS, EMPTY_FILTERS, TIERS, TIMES, type FilterState, type Tier } from '@/lib/explorer/filters'
import { TransitFilter } from './transit-filter'
import { AreaFilter } from './area-filter'

export interface FilterPanelProps {
  locale: Locale
  bundle: CityBundle
  filters: FilterState
  onChange: (next: FilterState) => void
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/** The right-hand filter panel (a bottom sheet on phones), after Glaibaan's. The kind chips live in KindBar under the header. */
export function FilterPanel({ locale, bundle, filters, onChange }: FilterPanelProps) {
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
      <Section label={s.filters.tiers}>
        <div className="flex flex-wrap gap-1.5">
          {TIERS.map((tier: Tier) => {
            const on = filters.tiers.includes(tier)
            return (
              <button key={tier} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, tiers: toggle(filters.tiers, tier) })} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
                {s.filters.tier[tier]}
              </button>
            )
          })}
        </div>
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
