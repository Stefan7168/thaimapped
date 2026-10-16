'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, MapPin, Search, X } from 'lucide-react'
import type { CityBundle, Locale } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { subareaKey } from '@/lib/explorer/filters'

/**
 * The area picker, same shape as the transit picker: picked chips, a search
 * box, then an accordion area -> sub-area rows with a whole-area tick.
 */
export interface AreaFilterProps {
  locale: Locale
  bundle: CityBundle
  areas: string[]
  subareas: string[]
  onChange: (next: { areas: string[]; subareas: string[] }) => void
}

export function AreaFilter({ locale, bundle, areas, subareas, onChange }: AreaFilterProps) {
  const s = strings(locale)
  const [query, setQuery] = useState('')
  const [openArea, setOpenArea] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  const matches = useMemo(() => {
    const set = new Set<string>()
    if (!searching) return set
    for (const a of bundle.areas) {
      const areaHit = t(a.name, locale).toLowerCase().includes(q)
      for (const sub of a.subareas) {
        if (areaHit || t(sub.name, locale).toLowerCase().includes(q)) set.add(subareaKey(a.id, sub.id))
      }
    }
    return set
  }, [bundle, locale, q, searching])

  function toggleArea(id: string) {
    onChange({ areas: areas.includes(id) ? areas.filter((x) => x !== id) : [...areas, id], subareas })
  }
  function toggleSub(key: string) {
    onChange({ areas, subareas: subareas.includes(key) ? subareas.filter((x) => x !== key) : [...subareas, key] })
  }

  return (
    <div className="flex flex-col gap-3">
      {(areas.length > 0 || subareas.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {areas.map((id) => {
            const a = bundle.areas.find((x) => x.id === id)
            if (!a) return null
            return <Chip key={id} color={`var(--${a.color})`} label={t(a.name, locale)} onRemove={() => toggleArea(id)} removeLabel={s.filters.removeArea(t(a.name, locale))} />
          })}
          {subareas.map((key) => {
            const [areaId, subId] = key.split('/')
            const a = bundle.areas.find((x) => x.id === areaId)
            const sub = a?.subareas.find((x) => x.id === subId)
            if (!a || !sub) return null
            return <Chip key={key} color={`var(--${a.color})`} label={t(sub.name, locale)} onRemove={() => toggleSub(key)} removeLabel={s.filters.removeArea(t(sub.name, locale))} />
          })}
        </div>
      )}
      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={s.filters.areaSearch}
          placeholder={s.filters.areaSearch}
          className="h-10 w-full appearance-none rounded-lg border border-line bg-white pl-9 pr-9 text-sm outline-none focus:border-accent [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" aria-label={s.filters.transitClear} onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 hover:bg-paper-2">
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </label>
      {searching && matches.size === 0 && <p className="text-xs text-ink-2">{s.filters.areaNoMatch}</p>}
      <div className="flex flex-col gap-1.5">
        {bundle.areas.map((a) => {
          const subs = searching ? a.subareas.filter((sub) => matches.has(subareaKey(a.id, sub.id))) : a.subareas
          if (subs.length === 0) return null
          const selectedCount = (areas.includes(a.id) ? 1 : 0) + a.subareas.filter((sub) => subareas.includes(subareaKey(a.id, sub.id))).length
          const isOpen = searching || openArea === a.id
          return (
            <div key={a.id} className="rounded-lg border border-line bg-white">
              <div className="grid min-h-10 grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pr-2">
                <button
                  type="button"
                  aria-expanded={isOpen}
                  onClick={() => !searching && setOpenArea(openArea === a.id ? null : a.id)}
                  className="flex min-h-10 min-w-0 items-center gap-2 rounded-lg px-3 text-left text-sm font-medium"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md" style={{ background: `color-mix(in srgb, var(--${a.color}) 14%, transparent)`, color: `var(--${a.color})` }}>
                    <MapPin aria-hidden="true" className="size-4" />
                  </span>
                  <span className="truncate">{t(a.name, locale)}</span>
                  {selectedCount > 0 && (
                    <span className="inline-flex min-w-5 shrink-0 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">{selectedCount}</span>
                  )}
                  <ChevronDown aria-hidden="true" className={`ml-auto size-4 shrink-0 text-ink-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </button>
                <label className="flex items-center gap-1.5 text-xs text-ink-2">
                  <input type="checkbox" checked={areas.includes(a.id)} onChange={() => toggleArea(a.id)} aria-label={`${s.filters.wholeArea} ${t(a.name, locale)}`} className="size-4 rounded border-line accent-[var(--accent)]" />
                  {s.filters.wholeArea}
                </label>
              </div>
              {isOpen && (
                <div className="space-y-0.5 border-t border-line p-2">
                  {subs.map((sub) => {
                    const key = subareaKey(a.id, sub.id)
                    return (
                      <label key={key} className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-sm ${matches.has(key) ? 'bg-accent/10' : ''}`}>
                        <input type="checkbox" checked={subareas.includes(key)} onChange={() => toggleSub(key)} className="size-4 rounded border-line accent-[var(--accent)]" />
                        <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: `var(--${a.color})` }} />
                        <span className="truncate">{t(sub.name, locale)}</span>
                      </label>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Chip({ color, label, onRemove, removeLabel }: { color: string; label: string; onRemove: () => void; removeLabel: string }) {
  return (
    <button type="button" aria-label={removeLabel} onClick={onRemove} className="flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-accent bg-accent/10 py-1.5 pl-2.5 pr-2 text-sm font-medium text-accent-text">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  )
}
