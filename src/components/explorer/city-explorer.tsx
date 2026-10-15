'use client'

import dynamic from 'next/dynamic'
import { useMemo, useState, useSyncExternalStore } from 'react'
import type { CityBundle, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { supports3D } from '@/lib/map/device'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { SiteHeader } from './site-header'
import { SiteFooter } from './site-footer'

const ExplorerMap = dynamic(() => import('@/components/map/explorer-map').then((m) => m.ExplorerMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
})

export function CityExplorer({ locale, bundle }: { locale: Locale; bundle: CityBundle }) {
  const s = strings(locale)
  const { city, areas, stations } = bundle
  // Device capability decides 3D on the client; null during server render so the
  // map (client only) never mounts with the wrong mode. The user can override.
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const [override3D, setOverride3D] = useState<boolean | null>(null)
  const threeD = override3D ?? detected3D
  const [selectedArea, setSelectedArea] = useState<string | null>(null)
  const [stationQuery, setStationQuery] = useState('')
  const [selectedStation, setSelectedStation] = useState<Station | null>(null)
  const [activePin, setActivePin] = useState<Pin | null>(null)

  const stationMatches = useMemo(() => {
    const q = stationQuery.trim().toLowerCase()
    if (q.length < 2) return []
    return stations.filter((st) => st.name.en.toLowerCase().includes(q) || (st.code !== '' && st.code.toLowerCase() === q)).slice(0, 6)
  }, [stationQuery, stations])

  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])

  function pickArea(id: string | null) {
    setSelectedArea(id)
    setSelectedStation(null)
    setStationQuery('')
    setActivePin(null)
  }
  function pickStation(st: Station) {
    setSelectedStation(st)
    setSelectedArea(null)
    setActivePin(null)
    setStationQuery(st.name.en)
  }

  return (
    <div className="flex h-dvh flex-col">
      <SiteHeader locale={locale} />
      <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
        <aside className="order-2 max-h-[45dvh] overflow-y-auto border-t border-line bg-paper md:order-1 md:h-auto md:max-h-none md:w-[380px] md:border-r md:border-t-0">
          <div className="p-4">
            <h1 className="font-display text-2xl font-semibold">{t(city.name, locale)}</h1>
            <p className="mt-1 text-sm text-ink-2">{t(city.tagline, locale)}</p>

            <section className="mt-5">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{s.city.stationsHeading}</h2>
              <input
                value={stationQuery}
                onChange={(e) => {
                  setStationQuery(e.target.value)
                  if (selectedStation) setSelectedStation(null)
                }}
                placeholder={s.city.stationPlaceholder}
                className="mt-2 w-full rounded-md border border-line bg-white px-3 py-2 text-sm outline-none focus:border-accent"
                aria-label={s.city.stationsHeading}
              />
              {stationQuery.trim().length >= 2 && !selectedStation && (
                <ul className="mt-1 divide-y divide-line rounded-md border border-line bg-white text-sm">
                  {stationMatches.length === 0 && <li className="px-3 py-2 text-ink-2">{s.city.noStation}</li>}
                  {stationMatches.map((st) => (
                    <li key={st.id}>
                      <button type="button" onClick={() => pickStation(st)} className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-paper-2">
                        {st.code && <span className="rounded bg-paper-2 px-1.5 py-0.5 text-[11px] font-semibold text-ink-2">{st.code}</span>}
                        <span>{t(st.name, locale)}</span>
                        <span className="ml-auto text-xs text-ink-2">{st.system} {st.line}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="mt-6">
              <div className="flex items-baseline justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{s.city.areasHeading}</h2>
                {(selectedArea || selectedStation) && (
                  <button type="button" onClick={() => pickArea(null)} className="text-xs text-accent underline">
                    {s.city.reset}
                  </button>
                )}
              </div>
              <p className="mt-1 text-sm text-ink-2">{s.city.areasIntro}</p>
              <ul className="mt-3 space-y-2">
                {areas.map((a) => {
                  const active = a.id === selectedArea
                  return (
                    <li key={a.id}>
                      <button
                        type="button"
                        onClick={() => pickArea(active ? null : a.id)}
                        className={`w-full rounded-lg border px-3 py-2 text-left transition ${active ? 'border-ink bg-white' : 'border-line bg-white/60 hover:bg-white'}`}
                      >
                        <span className="flex items-center gap-2">
                          <span className="inline-block h-3 w-3 rounded-full" style={{ background: `var(--${a.color})` }} />
                          <span className="font-semibold">{t(a.name, locale)}</span>
                        </span>
                        <span className="mt-0.5 block text-sm text-ink-2">{t(a.tagline, locale)}</span>
                        <span className="mt-1 flex flex-wrap gap-1">
                          {a.fits.map((f) => (
                            <span key={f} className="rounded bg-paper-2 px-1.5 py-0.5 text-[11px] text-ink-2">{f}</span>
                          ))}
                        </span>
                      </button>
                      {active && (
                        <ul className="mt-2 space-y-1 pl-3">
                          {a.pins.map((pin) => {
                            const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
                            const partners = Object.keys(pin.links) as Partner[]
                            return (
                              <li key={pin.id} className={`rounded-md border px-3 py-2 text-sm ${activePin?.id === pin.id ? 'border-ink bg-white' : 'border-line bg-white/60'}`}>
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-semibold uppercase text-ink-2">{s.pin[pin.kind]}</span>
                                  <span className="font-medium">{t(pin.name, locale)}</span>
                                </div>
                                <p className="text-ink-2">{t(pin.why, locale)}</p>
                                {pin.walk && walkStation && (
                                  <p className="text-xs text-ink-2">
                                    {s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}
                                  </p>
                                )}
                                {partners.length > 0 && (
                                  <div className="mt-1 flex gap-2">
                                    {partners.map((p) => (
                                      <a
                                        key={p}
                                        href={buildOutboundUrl(p, pin.links[p]!, subIdFor(`${city.id}-${a.id}`, pin.id))}
                                        target="_blank"
                                        rel="noopener sponsored"
                                        className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white"
                                      >
                                        {p}
                                      </a>
                                    ))}
                                  </div>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </li>
                  )
                })}
              </ul>
            </section>
          </div>
          <SiteFooter locale={locale} />
        </aside>

        <div className="relative order-1 min-h-[55dvh] flex-1 md:order-2 md:min-h-0">
          {threeD !== null && (
            <ExplorerMap
              key={threeD ? '3d' : '2d'}
              locale={locale}
              initialCamera={threeD ? city.camera : city.camera2d}
              threeD={threeD}
              areas={areas}
              selectedArea={selectedArea}
              selectedStation={selectedStation}
              onSelectArea={(id) => pickArea(id)}
              onSelectPin={(pin) => setActivePin(pin)}
            />
          )}
          {threeD !== null && (
            <button
              type="button"
              onClick={() => setOverride3D(!threeD)}
              className="absolute left-3 top-3 rounded-md border border-line bg-paper px-2.5 py-1 text-xs font-semibold shadow-sm"
            >
              {threeD ? s.city.flat : s.city.tilt}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function noopSubscribe() {
  return () => {}
}
