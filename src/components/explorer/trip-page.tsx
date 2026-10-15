'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useState } from 'react'
import { ArrowLeft } from 'lucide-react'
import type { Locale, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { STOP_COLORS } from '@/components/map/trip-map'
import { SiteFooter } from './site-footer'

const TripMap = dynamic(() => import('@/components/map/trip-map').then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="h-full w-full animate-pulse bg-paper-2" />,
})

/** A trip: the map on the left, the day-by-day plan on the right. */
export function TripPage({ locale, cityId, cityName, route }: { locale: Locale; cityId: string; cityName: string; route: TripRoute }) {
  const s = strings(locale)
  const [day, setDay] = useState<number | null>(null)
  const [activeStop, setActiveStop] = useState<string | null>(null)
  const days = Array.from({ length: route.days }, (_, i) => i + 1)

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 border-b border-line bg-paper px-3 py-2 md:px-4">
        <Link href={`/${locale}`} className="shrink-0 font-display text-xl font-semibold tracking-tight">{s.brand}</Link>
        <Link href={`/${locale}/${cityId}`} className="ml-auto flex items-center gap-1 text-sm text-ink-2">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {cityName}
        </Link>
      </header>
      <div className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative order-1 min-h-[45dvh] flex-1 md:min-h-0">
          <TripMap locale={locale} route={route} day={day} activeStopId={activeStop} onSelectStop={(id) => setActiveStop(id)} />
          {!route.path && (
            <p className="pointer-events-none absolute inset-x-3 bottom-3 rounded-lg border border-line bg-paper/95 px-3 py-1.5 text-xs text-ink-2 md:right-auto md:max-w-sm">{s.trip.pathNote}</p>
          )}
        </div>
        <aside className="order-2 max-h-[55dvh] overflow-y-auto border-t border-line bg-paper md:max-h-none md:w-[24rem] md:border-l md:border-t-0">
          <div className="p-4">
            <h1 className="font-display text-2xl font-semibold">{t(route.name, locale)}</h1>
            <p className="mt-1 text-sm text-ink-2">{t(route.tagline, locale)}</p>
            <p className="mt-2 flex flex-wrap gap-2 text-xs text-ink-2">
              <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.duration[route.duration]}</span>
              {route.duration === 'multi-day' && <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.days(route.days)}</span>}
              <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.mode[route.mode]}</span>
              {route.distanceKm !== undefined && <span className="rounded bg-paper-2 px-1.5 py-0.5">{s.trip.km(route.distanceKm)}</span>}
            </p>
            {route.days > 1 && (
            <div className="mt-4 flex gap-1.5">
              <button type="button" aria-pressed={day === null} onClick={() => { setDay(null); setActiveStop(null) }} className={`min-h-9 rounded-full border px-3 text-sm ${day === null ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
                {s.trip.days(route.days)}
              </button>
              {days.map((d) => (
                <button key={d} type="button" aria-pressed={day === d} onClick={() => { setDay(d); setActiveStop(null) }} className={`min-h-9 rounded-full border px-3 text-sm ${day === d ? 'border-ink bg-white font-medium' : 'border-line bg-white/60'}`}>
                  {s.trip.day(d)}
                </button>
              ))}
            </div>
            )}
            {days.map((d) => (
              <section key={d} className={`mt-5 ${day !== null && day !== d ? 'opacity-50' : ''}`}>
                {route.days > 1 && <h2 className="text-xs font-semibold uppercase tracking-wider text-ink-2">{s.trip.day(d)}</h2>}
                <ol className="mt-2 space-y-1.5">
                  {route.stops.map((stop, i) => {
                    if (stop.day !== d) return null
                    const active = stop.id === activeStop
                    const partners = Object.keys(stop.links) as Partner[]
                    return (
                      <li key={stop.id}>
                        <button type="button" onClick={() => setActiveStop(active ? null : stop.id)} className={`flex w-full gap-3 rounded-lg border px-3 py-2 text-left text-sm ${active ? 'border-ink bg-white' : 'border-line bg-white/70'}`}>
                          <span className="mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: STOP_COLORS[stop.kind] }}>{i + 1}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[11px] font-semibold uppercase text-ink-2">{s.stop[stop.kind]}</span>
                              <span className="truncate font-medium">{t(stop.name, locale)}</span>
                            </span>
                            <span className="block text-ink-2">{t(stop.why, locale)}</span>
                          </span>
                        </button>
                        {active && partners.length > 0 && (
                          <div className="mt-1 flex gap-2 pl-12">
                            {partners.map((p) => (
                              <a key={p} href={buildOutboundUrl(p, stop.links[p]!, subIdFor(`${cityId}-trip-${route.id}`, stop.id))} target="_blank" rel="noopener sponsored" className="rounded bg-accent px-2 py-1 text-xs font-semibold text-white">{p}</a>
                            ))}
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ol>
              </section>
            ))}
          </div>
          <SiteFooter locale={locale} />
        </aside>
      </div>
    </div>
  )
}
