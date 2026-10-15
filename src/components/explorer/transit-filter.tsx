'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, Plus, Search, TrainFront, TrainFrontTunnel, TrainTrack, TramFront, X } from 'lucide-react'
import type { CityBundle, Locale, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { groupBySystem, lineColor, lineKey, SYSTEM_ORDER } from '@/lib/explorer/filters'

/**
 * The transit picker, after Glaibaan's: picked stations as chips, a station
 * search box, then an accordion system -> line -> station rows. A whole line
 * can be ticked at once. Typing opens everything and highlights matches.
 */
const SYSTEM_ICON = { BTS: TramFront, MRT: TrainFrontTunnel, ARL: TrainFront, SRT: TrainTrack } as const
const SYSTEM_TINT: Record<string, string> = {
  BTS: 'bg-emerald-500/12 text-emerald-700',
  MRT: 'bg-blue-500/12 text-blue-700',
  ARL: 'bg-red-500/12 text-red-700',
  SRT: 'bg-rose-700/12 text-rose-800',
}

export function stationLabel(st: Station, locale: Locale): string {
  const name = t(st.name, locale)
  return st.code ? `${st.code} ${name}` : name
}

export interface TransitFilterProps {
  locale: Locale
  bundle: CityBundle
  stations: string[]
  lines: string[]
  onChange: (next: { stations: string[]; lines: string[] }) => void
}

export function TransitFilter({ locale, bundle, stations, lines, onChange }: TransitFilterProps) {
  const s = strings(locale)
  const [query, setQuery] = useState('')
  const [openSystem, setOpenSystem] = useState<string | null>(null)
  const [openLine, setOpenLine] = useState<string | null>(null)
  const q = query.trim().toLowerCase()
  const searching = q.length > 0

  const bySystem = useMemo(() => groupBySystem(bundle), [bundle])
  const stationById = useMemo(() => new Map(bundle.stations.map((st) => [st.id, st])), [bundle])
  const matches = useMemo(() => {
    if (!searching) return new Set<string>()
    return new Set(
      bundle.stations
        .filter((st) => st.name.en.toLowerCase().includes(q) || (st.name.th ?? '').includes(q) || st.code.toLowerCase() === q)
        .map((st) => st.id),
    )
  }, [bundle, q, searching])

  function toggleStation(id: string) {
    onChange({ stations: stations.includes(id) ? stations.filter((x) => x !== id) : [...stations, id], lines })
  }
  function toggleLine(key: string) {
    onChange({ stations, lines: lines.includes(key) ? lines.filter((x) => x !== key) : [...lines, key] })
  }

  return (
    <div className="flex flex-col gap-3">
      {(stations.length > 0 || lines.length > 0) && (
        <div className="flex flex-wrap items-center gap-2">
          {lines.map((key) => {
            const line = bundle.lines.find((l) => lineKey(l) === key)
            if (!line) return null
            return (
              <Chip key={key} color={line.color} label={`${line.system} ${line.line}`} onRemove={() => toggleLine(key)} removeLabel={s.filters.removeStation(line.line)} />
            )
          })}
          {stations.map((id) => {
            const st = stationById.get(id)
            if (!st) return null
            return (
              <Chip key={id} color={lineColor(bundle, st)} label={stationLabel(st, locale)} onRemove={() => toggleStation(id)} removeLabel={s.filters.removeStation(stationLabel(st, locale))} />
            )
          })}
          <button
            type="button"
            onClick={() => document.getElementById('tm-station-search')?.focus()}
            className="flex min-h-9 items-center gap-1.5 rounded-full border border-dashed border-line bg-white px-3 text-sm font-medium"
          >
            <Plus aria-hidden="true" className="size-4" />
            {s.filters.addStation}
          </button>
        </div>
      )}
      <label className="relative block">
        <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-2" />
        <input
          id="tm-station-search"
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label={s.filters.transitSearch}
          placeholder={s.filters.transitSearch}
          className="h-10 w-full appearance-none rounded-lg border border-line bg-white pl-9 pr-9 text-sm outline-none focus:border-accent [&::-webkit-search-cancel-button]:appearance-none"
        />
        {query && (
          <button type="button" aria-label={s.filters.transitClear} onClick={() => setQuery('')} className="absolute right-1.5 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-full text-ink-2 hover:bg-paper-2">
            <X aria-hidden="true" className="size-4" />
          </button>
        )}
      </label>
      {searching && matches.size === 0 && <p className="text-xs text-ink-2">{s.filters.transitNoMatch}</p>}
      <div className="flex flex-col gap-1.5">
        {SYSTEM_ORDER.map((system) => {
          const groups = (bySystem.get(system) ?? [])
            .map((g) => ({ ...g, stations: searching ? g.stations.filter((st) => matches.has(st.id)) : g.stations }))
            .filter((g) => g.stations.length > 0)
          if (groups.length === 0) return null
          const Icon = SYSTEM_ICON[system]
          const selectedCount = (bySystem.get(system) ?? []).reduce(
            (n, g) => n + (lines.includes(lineKey(g.line)) ? 1 : 0) + g.stations.filter((st) => stations.includes(st.id)).length,
            0,
          )
          const isOpen = searching || openSystem === system
          return (
            <div key={system} className="rounded-lg border border-line bg-white">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => {
                  if (searching) return
                  setOpenSystem(openSystem === system ? null : system)
                  setOpenLine(null)
                }}
                className="flex min-h-10 w-full items-center justify-between gap-2 rounded-lg px-3 text-sm font-medium"
              >
                <span className="flex items-center gap-2">
                  <span className={`flex size-7 items-center justify-center rounded-md ${SYSTEM_TINT[system]}`}>
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  {system}
                  {selectedCount > 0 && (
                    <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 py-0.5 text-xs font-semibold text-white">{selectedCount}</span>
                  )}
                </span>
                <ChevronDown aria-hidden="true" className={`size-4 text-ink-2 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              {isOpen && (
                <div className="space-y-1 border-t border-line p-2">
                  {groups.map((g) => {
                    const key = lineKey(g.line)
                    const lineOpen = searching || openLine === key || groups.length === 1
                    return (
                      <div key={key} className="overflow-hidden rounded-lg bg-paper">
                        <div className="grid min-h-11 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 px-2 text-sm">
                          <span aria-hidden="true" className="size-4 rounded-[0.3rem] border border-black/15" style={{ backgroundColor: g.line.color }} />
                          <button type="button" aria-expanded={lineOpen} onClick={() => !searching && setOpenLine(openLine === key ? null : key)} className="min-w-0 truncate text-left font-medium">
                            {g.line.line}
                          </button>
                          <label className="flex items-center gap-1.5 text-xs text-ink-2">
                            <input type="checkbox" checked={lines.includes(key)} onChange={() => toggleLine(key)} className="size-4 rounded border-line accent-[var(--accent)]" />
                            {s.filters.allStations}
                          </label>
                        </div>
                        {lineOpen && (
                          <div className="max-h-64 space-y-0.5 overflow-y-auto px-1 pb-1">
                            {g.stations.map((st) => (
                              <label
                                key={st.id}
                                className={`flex min-h-9 items-center gap-2 rounded-md px-2 text-sm ${matches.has(st.id) ? 'bg-accent/10' : ''}`}
                              >
                                <input type="checkbox" checked={stations.includes(st.id)} onChange={() => toggleStation(st.id)} className="size-4 rounded border-line accent-[var(--accent)]" />
                                <span aria-hidden="true" className="size-2.5 rounded-full" style={{ backgroundColor: g.line.color }} />
                                {st.code && <span className="w-10 shrink-0 text-xs font-semibold text-ink-2">{st.code}</span>}
                                <span className="truncate">{t(st.name, locale)}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
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
    <button
      type="button"
      aria-label={removeLabel}
      onClick={onRemove}
      className="flex min-h-9 max-w-full items-center gap-1.5 rounded-full border border-accent bg-accent/10 py-1.5 pl-2.5 pr-2 text-sm font-medium text-accent"
    >
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="truncate">{label}</span>
      <X aria-hidden="true" className="size-3.5 shrink-0" />
    </button>
  )
}
