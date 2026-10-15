'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { SlidersHorizontal, X } from 'lucide-react'
import type { CityBundle, Locale, Pin } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { supports3D } from '@/lib/map/device'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { activeFilterCount, EMPTY_FILTERS, selectedPlaceCentres, selectedStations, visiblePins, type FilterState } from '@/lib/explorer/filters'
import { FilterPanel } from './filter-panel'
import { TopSearch, type SearchHit } from './top-search'
import { SiteFooter } from './site-footer'

const ExplorerMap = dynamic(() => import('@/components/map/explorer-map').then((m) => m.ExplorerMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
})

/**
 * Glaibaan-style shell: search bar in the header, the map filling the page,
 * filters in a right-hand panel on wide screens and a bottom sheet on phones.
 */
export function CityExplorer({ locale, bundle }: { locale: Locale; bundle: CityBundle }) {
  const s = strings(locale)
  const { city, areas } = bundle
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const [override3D, setOverride3D] = useState<boolean | null>(null)
  const threeD = override3D ?? detected3D
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS)
  const [activePin, setActivePin] = useState<Pin | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)

  const pins = useMemo(() => visiblePins(bundle, filters), [bundle, filters])
  const stations = useMemo(() => selectedStations(bundle, filters), [bundle, filters])
  const centres = useMemo(() => selectedPlaceCentres(bundle, filters), [bundle, filters])
  const stationById = useMemo(() => new Map(bundle.stations.map((st) => [st.id, st])), [bundle])
  const count = activeFilterCount(filters)

  function update(next: FilterState) {
    setFilters(next)
    setActivePin(null)
  }
  function onPick(hit: SearchHit) {
    if (hit.kind === 'area') update({ ...filters, areas: filters.areas.includes(hit.id) ? filters.areas : [...filters.areas, hit.id] })
    else if (hit.kind === 'subarea') update({ ...filters, subareas: filters.subareas.includes(hit.id) ? filters.subareas : [...filters.subareas, hit.id] })
    else if (hit.kind === 'station') update({ ...filters, stations: filters.stations.includes(hit.id) ? filters.stations : [...filters.stations, hit.id] })
    else {
      update({ ...EMPTY_FILTERS, areas: [hit.areaId] })
      const pin = areas.find((a) => a.id === hit.areaId)?.pins.find((p) => p.id === hit.id) ?? null
      setActivePin(pin)
    }
  }

  const panel = <FilterPanel locale={locale} bundle={bundle} filters={filters} onChange={update} />

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-paper px-3 py-2 md:px-4">
        <Link href={`/${locale}`} className="shrink-0 font-display text-xl font-semibold tracking-tight">
          {s.brand}
        </Link>
        <div className="mx-auto w-full max-w-xl">
          <TopSearch locale={locale} bundle={bundle} onPick={onPick} />
        </div>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-full border border-line bg-white px-3 py-2 text-sm font-medium md:hidden"
        >
          <SlidersHorizontal aria-hidden="true" className="size-4" />
          {s.filters.open}
          {count > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-semibold text-white">{count}</span>}
        </button>
        <span className="hidden shrink-0 text-sm text-ink-2 md:inline">{t(city.name, locale)}</span>
      </header>

      <div className="relative flex min-h-0 flex-1">
        <div className="relative min-h-0 flex-1">
          {threeD !== null && (
            <ExplorerMap
              key={threeD ? '3d' : '2d'}
              locale={locale}
              cityCamera={threeD ? city.camera : city.camera2d}
              threeD={threeD}
              areas={areas}
              pins={pins}
              stations={stations}
              centres={centres}
              activePinId={activePin?.id ?? null}
              onSelectArea={(id) => update({ ...filters, areas: [id] })}
              onSelectPin={(pin) => setActivePin(pin)}
            />
          )}
          {threeD !== null && (
            <button type="button" onClick={() => setOverride3D(!threeD)} className="absolute left-3 top-3 rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-semibold shadow-sm">
              {threeD ? s.city.flat : s.city.tilt}
            </button>
          )}

          {/* Results strip over the map: what the filters found. */}
          {count > 0 && (
            <div className="absolute inset-x-3 bottom-3 max-h-[40%] overflow-y-auto rounded-xl border border-line bg-paper/95 p-2 shadow-lg md:left-3 md:right-auto md:w-80">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.filters.results(pins.length)}</p>
              {pins.length === 0 && <p className="px-1 pb-1 text-sm text-ink-2">{s.filters.noResults}</p>}
              <ul className="space-y-1">
                {pins.map(({ pin, area }) => {
                  const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
                  const partners = Object.keys(pin.links) as Partner[]
                  const active = activePin?.id === pin.id
                  return (
                    <li key={pin.id}>
                      <button type="button" onClick={() => setActivePin(pin)} className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-ink bg-white' : 'border-line bg-white/70'}`}>
                        <span className="flex items-center gap-2">
                          <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: `var(--${area.color})` }} />
                          <span className="text-[11px] font-semibold uppercase text-ink-2">{s.pin[pin.kind]}</span>
                          <span className="truncate font-medium">{t(pin.name, locale)}</span>
                        </span>
                        <span className="block text-ink-2">{t(pin.why, locale)}</span>
                        {pin.walk && walkStation && (
                          <span className="block text-xs text-ink-2">
                            {s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}
                          </span>
                        )}
                      </button>
                      {active && partners.length > 0 && (
                        <div className="mt-1 flex gap-2 px-1">
                          {partners.map((p) => (
                            <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subIdFor(`${city.id}-${area.id}`, pin.id))} target="_blank" rel="noopener sponsored" className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white">
                              {p}
                            </a>
                          ))}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}
          {count === 0 && (
            <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl border border-line bg-paper/95 px-3 py-2 text-center text-sm text-ink-2 shadow md:left-3 md:right-auto md:w-80 md:text-left">
              {s.filters.emptyHint}
            </p>
          )}
        </div>

        {/* Wide screens: the panel sits on the right. */}
        <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-line bg-paper md:block">
          {panel}
          <SiteFooter locale={locale} />
        </aside>

        {/* Phones: the same panel as a bottom sheet. */}
        {sheetOpen && (
          <div className="absolute inset-0 z-40 md:hidden">
            <button type="button" aria-label={s.filters.close} onClick={() => setSheetOpen(false)} className="absolute inset-0 bg-black/40" />
            <div role="dialog" aria-modal="true" aria-label={s.filters.title} className="absolute inset-x-0 bottom-0 flex h-[74dvh] flex-col rounded-t-2xl border-t border-line bg-paper shadow-2xl">
              <div className="flex items-center justify-between px-3 pt-2">
                <span className="mx-auto h-1.5 w-10 rounded-full bg-ink-2/30" />
                <button type="button" onClick={() => setSheetOpen(false)} className="absolute right-2 top-2 flex size-8 items-center justify-center rounded-full text-ink-2">
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">{panel}</div>
              <div className="border-t border-line p-3">
                <button type="button" onClick={() => setSheetOpen(false)} className="w-full rounded-lg bg-ink py-2.5 text-sm font-semibold text-white">
                  {s.filters.close} {count > 0 ? `(${s.filters.results(pins.length)})` : ''}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function noopSubscribe() {
  return () => {}
}
