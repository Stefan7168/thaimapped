'use client'

import type { ReactNode } from 'react'
import type { CityBundle, Locale, PinKind } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { activeFilterCount, EMPTY_FILTERS, PIN_KINDS, TIERS, type FilterState, type Tier } from '@/lib/explorer/filters'
import { TransitFilter } from './transit-filter'

export interface FilterPanelProps {
  locale: Locale
  bundle: CityBundle
  filters: FilterState
  onChange: (next: FilterState) => void
}

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((x) => x !== value) : [...list, value]
}

/** The right-hand filter panel (a bottom sheet on phones), after Glaibaan's. */
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

      <Section label={s.filters.transit}>
        <TransitFilter
          locale={locale}
          bundle={bundle}
          stations={filters.stations}
          lines={filters.lines}
          onChange={({ stations, lines }) => onChange({ ...filters, stations, lines })}
        />
      </Section>

      <Section label={s.filters.areas}>
        <div className="flex flex-wrap gap-1.5">
          {bundle.areas.map((a) => {
            const on = filters.areas.includes(a.id)
            return (
              <button
                key={a.id}
                type="button"
                aria-pressed={on}
                onClick={() => onChange({ ...filters, areas: toggle(filters.areas, a.id) })}
                className={`flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}
              >
                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: `var(--${a.color})` }} />
                {t(a.name, locale)}
              </button>
            )
          })}
        </div>
      </Section>

      <Section label={s.filters.kinds}>
        <div className="flex flex-wrap gap-1.5">
          {PIN_KINDS.map((k: PinKind) => {
            const on = filters.kinds.includes(k)
            return (
              <button key={k} type="button" aria-pressed={on} onClick={() => onChange({ ...filters, kinds: toggle(filters.kinds, k) })} className={`min-h-9 rounded-full border px-3 text-sm ${on ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
                {s.pin[k]}
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
