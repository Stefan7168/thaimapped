'use client'

import { useMemo, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { CityBundle, Locale } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { stationLabel } from './transit-filter'

export type SearchHit =
  | { kind: 'area'; id: string; label: string; color: string }
  | { kind: 'station'; id: string; label: string; color: string; sub: string }
  | { kind: 'pin'; id: string; areaId: string; label: string; sub: string }

/** One search box over areas, stations and places. Picking a hit applies it as a filter. */
export function TopSearch({ locale, bundle, onPick }: { locale: Locale; bundle: CityBundle; onPick: (hit: SearchHit) => void }) {
  const s = strings(locale)
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const q = query.trim().toLowerCase()

  const hits = useMemo<SearchHit[]>(() => {
    if (q.length < 2) return []
    const out: SearchHit[] = []
    for (const a of bundle.areas) {
      if (t(a.name, locale).toLowerCase().includes(q)) out.push({ kind: 'area', id: a.id, label: t(a.name, locale), color: `var(--${a.color})` })
    }
    for (const st of bundle.stations) {
      if (st.name.en.toLowerCase().includes(q) || st.code.toLowerCase() === q) {
        const line = bundle.lines.find((l) => l.system === st.system && l.line === st.line)
        out.push({ kind: 'station', id: st.id, label: stationLabel(st, locale), color: line?.color ?? '#6f6a5f', sub: `${st.system} ${st.line}` })
      }
    }
    for (const a of bundle.areas) {
      for (const p of a.pins) {
        if (t(p.name, locale).toLowerCase().includes(q)) out.push({ kind: 'pin', id: p.id, areaId: a.id, label: t(p.name, locale), sub: `${s.pin[p.kind]}, ${t(a.name, locale)}` })
      }
    }
    return out.slice(0, 8)
  }, [bundle, locale, q, s])

  return (
    <div className="relative w-full">
      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
        <input
          type="search"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          aria-label={s.search.placeholder}
          placeholder={s.search.placeholder}
          className="h-10 w-full appearance-none rounded-full border border-line bg-white pl-9 pr-9 text-sm outline-none focus:border-accent [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" aria-label={s.filters.transitClear} onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 hover:bg-paper-2">
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </label>
      {open && q.length >= 2 && (
        <ul className="absolute left-0 right-0 top-11 z-30 overflow-hidden rounded-xl border border-line bg-white text-sm shadow-lg">
          {hits.length === 0 && <li className="px-3 py-2 text-ink-2">{s.search.noMatch}</li>}
          {hits.map((h) => (
            <li key={`${h.kind}-${h.id}`}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(h)
                  setQuery('')
                  setOpen(false)
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-paper-2"
              >
                {h.kind !== 'pin' && <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: h.color }} />}
                <span className="truncate">{h.label}</span>
                <span className="ml-auto shrink-0 text-xs text-ink-2">{h.kind === 'area' ? s.search.kindArea : h.kind === 'station' ? h.sub : h.sub}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
