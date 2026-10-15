'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, SlidersHorizontal, X } from 'lucide-react'
import type { CityBundle, Locale, Pin, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { supports3D } from '@/lib/map/device'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { activeFilterCount, EMPTY_FILTERS, selectedPlaceCentres, selectedStations, visiblePins, type FilterState } from '@/lib/explorer/filters'
import { FilterPanel } from './filter-panel'
import { TopSearch, type SearchHit } from './top-search'
import { SiteFooter } from './site-footer'
import { KindBar } from './kind-bar'

const ExplorerMap = dynamic(() => import('@/components/map/explorer-map').then((m) => m.ExplorerMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
})

/**
 * Glaibaan-style shell: search bar in the header, the map in the middle,
 * filters in a right-hand panel. On wide screens a left column carries the
 * area guide (nothing picked) or the list of places (something picked); on
 * phones that list floats over the map and the filters are a bottom sheet.
 */
export function CityExplorer({ locale, bundle, routes }: { locale: Locale; bundle: CityBundle; routes: TripRoute[] }) {
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
  // A ticked area, or any of its sub-areas, draws the area's district border on the map.
  const outlines = useMemo(
    () => areas.filter((a) => a.boundary && (filters.areas.includes(a.id) || filters.subareas.some((key) => key.startsWith(`${a.id}/`)))),
    [areas, filters.areas, filters.subareas],
  )
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

  const placeList = (
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
  )

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
        <Link href={`/${locale}/${city.id}/trip`} className="hidden shrink-0 rounded-full border border-line bg-white px-3 py-2 text-sm font-medium md:inline-block">{s.nav.trips}</Link>
      </header>
      <KindBar locale={locale} filters={filters} onChange={update} />

      <div className="relative flex min-h-0 flex-1">
        {/* Wide screens: the guide, or the places found, at the left. */}
        <aside className="hidden w-[22rem] shrink-0 flex-col overflow-y-auto border-r border-line bg-paper md:flex">
          {count === 0 ? (
            <AreaGuide locale={locale} bundle={bundle} routes={routes} onPickArea={(id) => update({ ...filters, areas: [id] })} />
          ) : (
            <div className="p-3">
              <button type="button" onClick={() => update(EMPTY_FILTERS)} className="mb-2 flex items-center gap-1.5 text-sm text-ink-2 hover:text-ink">
                <ArrowLeft aria-hidden="true" className="size-4" />
                {s.guide.back}
              </button>
              <p className="px-1 pb-2 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.guide.showing(pins.length)}</p>
              {pins.length === 0 && <p className="px-1 pb-1 text-sm text-ink-2">{s.filters.noResults}</p>}
              {placeList}
            </div>
          )}
        </aside>

        <div className="relative min-h-0 flex-1">
          {threeD !== null && (
            <ExplorerMap
              key={threeD ? '3d' : '2d'}
              locale={locale}
              cityId={city.id}
              cityCamera={threeD ? city.camera : city.camera2d}
              threeD={threeD}
              areas={areas}
              pins={pins}
              allStations={bundle.stations}
              stations={stations}
              centres={centres}
              outlines={outlines}
              activePinId={activePin?.id ?? null}
              onSelectArea={(id) => update({ ...filters, areas: [id] })}
              onSelectPin={(pin) => setActivePin(pin)}
              onClosePin={() => setActivePin(null)}
            />
          )}
          {threeD !== null && (
            <button type="button" onClick={() => setOverride3D(!threeD)} className="absolute left-3 top-3 rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-semibold shadow-sm">
              {threeD ? s.city.flat : s.city.tilt}
            </button>
          )}

          {/* Phones: the places found float over the map. */}
          {count > 0 && (
            <div className="absolute inset-x-3 bottom-3 max-h-[40%] overflow-y-auto rounded-xl border border-line bg-paper/95 p-2 shadow-lg md:hidden">
              <p className="px-1 pb-1 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.filters.results(pins.length)}</p>
              {pins.length === 0 && <p className="px-1 pb-1 text-sm text-ink-2">{s.filters.noResults}</p>}
              {placeList}
            </div>
          )}
          {count === 0 && (
            <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-xl border border-line bg-paper/95 px-3 py-2 text-center text-sm text-ink-2 shadow md:hidden">
              {s.filters.emptyHint}
            </p>
          )}
        </div>

        {/* Wide screens: the panel sits on the right. */}
        <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-line bg-paper md:block">
          {panel}
          <SiteFooter locale={locale} cityId={city.id} compact />
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

/** The left column while nothing is picked: the areas as cards, then the trips. */
function AreaGuide({ locale, bundle, routes, onPickArea }: { locale: Locale; bundle: CityBundle; routes: TripRoute[]; onPickArea: (id: string) => void }) {
  const s = strings(locale)
  const { city, areas } = bundle
  return (
    <div className="p-3">
      <h1 className="font-display text-xl font-semibold leading-tight tracking-tight">{s.guide.heading(t(city.name, locale))}</h1>
      <p className="mt-1 text-sm text-ink-2">{s.guide.intro}</p>
      <ul className="mt-3 space-y-2">
        {areas.map((a) => (
          <li key={a.id}>
            <button type="button" onClick={() => onPickArea(a.id)} className="w-full rounded-xl border border-line bg-white/70 px-3 py-2.5 text-left hover:border-ink" style={{ borderLeft: `4px solid var(--${a.color})` }}>
              <span className="flex items-baseline justify-between gap-2">
                <span className="font-semibold">{t(a.name, locale)}</span>
                <span className="shrink-0 text-xs text-ink-2">{s.guide.meta(a.stations.length, a.pins.length)}</span>
              </span>
              <span className="mt-0.5 block text-sm text-ink-2">{t(a.tagline, locale)}</span>
              <span className="mt-1.5 flex flex-wrap gap-1">
                {a.fits.map((f) => (
                  <span key={f} className="rounded-full bg-paper-2 px-2 py-0.5 text-[11px] font-medium text-ink">{s.guide.fits[f] ?? f}</span>
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {routes.length > 0 && (
        <>
          <h2 className="mt-5 text-xs font-semibold uppercase tracking-wider text-ink-2">{s.guide.tripsHeading}</h2>
          <ul className="mt-2 space-y-1">
            {routes.map((r) => (
              <li key={r.id}>
                <Link href={`/${locale}/${city.id}/trip/${r.id}`} className="flex items-baseline justify-between gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-paper-2">
                  <span className="font-medium">{t(r.name, locale)}</span>
                  <span className="shrink-0 text-xs text-ink-2">{r.duration === 'multi-day' ? s.trip.days(r.days) : s.trip.duration[r.duration]}</span>
                </Link>
              </li>
            ))}
          </ul>
          <Link href={`/${locale}/${city.id}/trip`} className="mt-2 inline-block px-2 text-sm underline underline-offset-2">{s.guide.tripsLink}</Link>
        </>
      )}
    </div>
  )
}

function noopSubscribe() {
  return () => {}
}
