'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, CalendarPlus, Share2 } from 'lucide-react'
import type { Locale, RouteStop, TripRoute } from '@/lib/content/types'
import type { AirportLeg } from '@/lib/transit/from-airport'
import { rideSentence } from '@/components/stay/from-airport'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { buildOutboundUrl, hotelSearchUrl, subIdFor, type Partner } from '@/lib/links/build'
import { TRAVEL_MODE, directionsUrl } from '@/lib/links/directions'
import type { HotelDoor } from '@/lib/content/slim'
import { useSaved } from '@/lib/saved/store'
import { myHotelChoice, useHotelChoiceVersion } from '@/lib/saved/my-hotel'
import { addDays, adoptStayFromUrl, stayParam, tripStartDefault, tripStartOptions, useStay } from '@/lib/stay/store'
import { buildIcs, downloadIcs, type CalendarEvent } from '@/lib/stay/calendar'
import { STOP_COLORS } from '@/components/map/trip-map'
import { bangkokClock } from '@/lib/explorer/when'

// Bangkok's date, read once in the browser; the server renders no "Today".
let clockCache: ReturnType<typeof bangkokClock> | null = null
const clockSnapshot = () => clockCache ?? (clockCache = bangkokClock())
const noopSubscribe = () => () => {}
import { SiteFooter } from './site-footer'

const TripMap = dynamic(() => import('@/components/map/trip-map').then((m) => m.TripMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper-2" />,
})

/** A trip: the map on the left, the day-by-day plan on the right. */
export function TripPage({ locale, cityId, cityName, route, hotelDoors = {}, startRides = {} }: { locale: Locale; cityId: string; cityName: string; route: TripRoute; hotelDoors?: Record<string, HotelDoor[]>; startRides?: Record<string, Record<string, AirportLeg[] | null>> }) {
  const s = strings(locale)
  const stay = useStay()
  const saved = useSaved()
  const choiceVersion = useHotelChoiceVersion()
  // The reader's hotel in the city (first saved, or the one chosen for its area): the trip then starts and ends at its door.
  const myHotel = useMemo(() => {
    for (const [areaId, doors] of Object.entries(hotelDoors)) {
      const mine = doors.filter((h) => saved.includes(h.id))
      if (mine.length > 0) return mine.find((h) => h.id === myHotelChoice(areaId)) ?? mine[0]
    }
    return null
    // choiceVersion is read so a new choice recomputes the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelDoors, saved, choiceVersion])
  const mode = TRAVEL_MODE[route.mode]
  // Getting from the hotel to a walking or boat trip is a train ride, not a walk across the city; a car trip drives from the door.
  const hotelMode = mode === 'driving' ? 'driving' : 'transit'
  // The line under the first stop: the rail ride from the hotel when the trip starts at a station, else just the hotel's name.
  function startLine(stop: RouteStop): string {
    const name = t(myHotel!.name, locale)
    const from = myHotel!.walk?.station
    if (!stop.station || !from) return s.trip.startFromHotel(name)
    if (stop.station === from) return s.trip.startAtYourStation(name)
    const legs = startRides[from]?.[stop.station]
    return legs && legs.length > 0 ? s.trip.startByTrain(name, rideSentence(legs, null, locale)) : s.trip.startFromHotel(name)
  }
  // The first stop's directions start at the hotel and go to the next stop; the last stop's go back to the hotel.
  const directions = (i: number): { href: string; label: string } => {
    const stop = route.stops[i]
    if (myHotel && i === 0) {
      const to = route.stops[1] ?? stop
      return { href: directionsUrl(to.location.lat, to.location.lon, { mode: hotelMode, from: myHotel.location }), label: s.trip.directionsFrom(t(myHotel.name, locale)) }
    }
    if (myHotel && stop.kind === 'end' && i === route.stops.length - 1) {
      const from = route.stops[i - 1]
      return { href: directionsUrl(myHotel.location.lat, myHotel.location.lon, { mode: hotelMode, from: from?.location }), label: s.trip.directionsTo(t(myHotel.name, locale)) }
    }
    return { href: directionsUrl(stop.location.lat, stop.location.lon, { mode }), label: s.card.directions }
  }
  const [day, setDay] = useState<number | null>(null)
  const [activeStop, setActiveStop] = useState<string | null>(null)
  const [hoverStop, setHoverStop] = useState<string | null>(null)
  const days = Array.from({ length: route.days }, (_, i) => i + 1)
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle')
  // A multi-day trip inside the stay starts on a day of the reader's choosing (?start=, or the chips); by default the latest day that is back by check-out.
  const [pickedStart, setPickedStart] = useState<string | null>(null)
  const startOptions = useMemo(() => (stay && route.days > 1 ? tripStartOptions(stay, route.days) : []), [stay, route.days])
  const startIso = stay ? (pickedStart && startOptions.includes(pickedStart) ? pickedStart : tripStartDefault(stay, route.days)) : null
  const dayIso = (d: number): string | null => (startIso ? addDays(startIso, d - 1) : null)
  const fmtDay = (date: string) => new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(`${date}T12:00:00`))
  // With dates set, day N is the start date plus N - 1, shown beside the day heading as the weekend page does.
  const dayDate = (d: number): string | null => {
    const date = dayIso(d)
    return date ? fmtDay(date) : null
  }
  useEffect(() => {
    adoptStayFromUrl()
    const id = window.requestAnimationFrame(() => {
      const sent = new URLSearchParams(window.location.search).get('start')
      if (sent && /^\d{4}-\d{2}-\d{2}$/.test(sent)) setPickedStart(sent)
    })
    return () => window.cancelAnimationFrame(id)
  }, [])
  // With dates set, the day whose date is today in Bangkok is marked.
  const clock = useSyncExternalStore(noopSubscribe, clockSnapshot, () => null)
  const isToday = (d: number): boolean => !!clock && dayIso(d) === clock.date
  // A hotel stop on the road sleeps that one night, so its search opens on that night, not on the Bangkok stay.
  const nightAt = (stop: RouteStop) => (startIso && stop.kind === 'hotel' ? { checkIn: addDays(startIso, stop.day - 1), checkOut: addDays(startIso, stop.day) } : stay)
  // The trip as a calendar file: one all-day-ish event per day (08:00 to 20:00 Bangkok), the day's stops in the description. Needs the dates.
  const addToCalendar = () => {
    if (!stay) return
    const url = window.location.href.split('#')[0]
    const name = t(route.name, locale)
    const events: CalendarEvent[] = days.map((d) => {
      const iso = dayIso(d)!
      const stops = route.stops.filter((st) => st.day === d)
      const stopsText = stops.map((st, i) => `${i + 1}. ${t(st.name, locale)}: ${t(st.why, locale)}`).join('\n')
      return {
        date: iso, start: '08:00', end: '20:00',
        title: s.trip.calendarDay(name, d, route.days),
        description: [`${s.weekendPage.calendarStops}:`, stopsText, myHotel && d === 1 ? `${s.weekendPage.calendarYourHotel}: ${t(myHotel.name, locale)}` : '', url].filter(Boolean).join('\n'),
        location: stops[0] ? t(stops[0].name, locale) : undefined,
        url,
      }
    })
    downloadIcs(`trip-${route.id}.ics`, buildIcs(events, name))
  }

  const share = async () => {
    // The link carries the dates, so the booking links open on the same nights for the other person.
    const u = new URL(window.location.href)
    if (stay) u.searchParams.set('stay', stayParam(stay))
    else u.searchParams.delete('stay')
    if (startIso && route.days > 1) u.searchParams.set('start', startIso)
    else u.searchParams.delete('start')
    const url = u.toString()
    const text = `${t(route.tagline, locale)} ${route.duration === 'multi-day' ? s.trip.days(route.days) : s.trip.duration[route.duration]} · ${s.trip.mode[route.mode].toLowerCase()}${route.distanceKm !== undefined ? ` · ${s.trip.km(route.distanceKm)}` : ''}.`
    try {
      if (navigator.share) {
        await navigator.share({ title: t(route.name, locale), text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch {
      setShared('failed')
    }
    window.setTimeout(() => setShared('idle'), 2500)
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex items-center gap-3 bg-paper-2 px-3 py-2 md:px-4">
        <Link href={`/${locale}`} className="tm-wordmark shrink-0">{s.brand}</Link>
        <Link href={`/${locale}/${cityId}`} className="tm-link ml-auto flex items-center gap-1 text-[15px]">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {cityName}
        </Link>
      </header>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative order-1 min-h-[45dvh] flex-1 md:min-h-0" data-ui>
          <TripMap locale={locale} route={route} day={day} activeStopId={activeStop} onSelectStop={(id) => setActiveStop(id)} hoverStopId={hoverStop} onHoverStop={setHoverStop} />
          {!route.path && (
            <p className="pointer-events-none absolute inset-x-3 bottom-3 bg-paper px-3 py-2 text-[15px] text-ink-2 md:right-auto md:max-w-sm">{s.trip.pathNote}</p>
          )}
        </div>
        <aside className="order-2 max-h-[55dvh] overflow-y-auto bg-paper md:max-h-none md:w-[24rem]">
          <div className="p-4">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{t(route.name, locale)}</h1>
            <p className="mt-2 text-[17px] leading-normal">{t(route.tagline, locale)}</p>
            <p className="mt-3 flex flex-wrap gap-2 text-[15px] text-ink-2">
              <span className="bg-paper-2 px-2 py-0.5">{s.trip.duration[route.duration]}</span>
              {route.duration === 'multi-day' && <span className="bg-paper-2 px-2 py-0.5">{s.trip.days(route.days)}</span>}
              <span className="bg-paper-2 px-2 py-0.5">{s.trip.mode[route.mode]}</span>
              {route.distanceKm !== undefined && <span className="bg-paper-2 px-2 py-0.5">{s.trip.km(route.distanceKm)}</span>}
            </p>
            <p className="mt-3">
              <button type="button" onClick={share} className="tm-button tm-button--small tm-button--quiet">
                <Share2 aria-hidden="true" className="size-4" />
                {shared === 'copied' ? s.trip.copied : shared === 'failed' ? s.trip.copyFailed : s.trip.share}
              </button>
              {stay && (
                <button type="button" onClick={addToCalendar} className="tm-button tm-button--small tm-button--quiet ml-2">
                  <CalendarPlus aria-hidden="true" className="size-4" />
                  {s.weekendPage.calendar}
                </button>
              )}
            </p>
            {startOptions.length > 1 && (
              <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[15px] text-ink-2">
                <span className="mr-1">{s.trip.startOn}</span>
                {startOptions.map((date) => (
                  <button key={date} type="button" aria-pressed={startIso === date} onClick={() => setPickedStart(date)} className={`tm-chip${startIso === date ? ' tm-chip--on' : ''}`}>{fmtDay(date)}</button>
                ))}
              </p>
            )}
            {route.days > 1 && (
            <div className="mt-4 flex gap-1.5">
              <button type="button" aria-pressed={day === null} onClick={() => { setDay(null); setActiveStop(null) }} className={`tm-chip${day === null ? ' tm-chip--on' : ''}`}>
                {s.trip.days(route.days)}
              </button>
              {days.map((d) => (
                <button key={d} type="button" aria-pressed={day === d} onClick={() => { setDay(d); setActiveStop(null) }} className={`tm-chip${day === d ? ' tm-chip--on' : ''}`}>
                  {s.trip.day(d)}
                </button>
              ))}
            </div>
            )}
            {days.map((d) => (
              <section key={d} className={`mt-5 ${day !== null && day !== d ? 'opacity-50' : ''}`}>
                {route.days > 1 && <h2 className="text-[17px] font-semibold">{s.trip.day(d)}{dayDate(d) && <span className="tm-wk__date"> · {dayDate(d)}</span>}{isToday(d) && <span className="tm-wk__now">{s.trip.today}</span>}</h2>}
                <ol className="mt-2 space-y-1.5">
                  {route.stops.map((stop, i) => {
                    if (stop.day !== d) return null
                    const active = stop.id === activeStop
                    const partners = Object.keys(stop.links) as Partner[]
                    return (
                      <li key={stop.id}>
                        <button type="button" onClick={() => setActiveStop(active ? null : stop.id)} onMouseEnter={() => setHoverStop(stop.id)} onMouseLeave={() => setHoverStop(null)} onFocus={() => setHoverStop(stop.id)} onBlur={() => setHoverStop(null)} className={`tm-stoprow${active ? ' tm-stoprow--on' : ''}${hoverStop === stop.id ? ' tm-stoprow--hover' : ''}`}>
                          <span className="tm-stoprow__num" style={{ ['--lc' as string]: STOP_COLORS[stop.kind] }}>{i + 1}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[15px] text-ink-2">{s.stop[stop.kind]}</span>
                              <span className="truncate text-[17px] font-medium">{t(stop.name, locale)}</span>
                            </span>
                            <span className="block text-[16px] text-ink">{t(stop.why, locale)}</span>
                            {stop.placeholder && <span className="tm-stoprow__tbc">{s.trip.placeholder}</span>}
                            {stop.search && <span className="block text-[13px] text-ink-2">{s.trip.searchHotels(stop.search, !!stay)}</span>}
                            {myHotel && i === 0 && <span className="block text-[13px] tm-wk__from">{startLine(stop)}</span>}
                            {myHotel && stop.kind === 'end' && i === route.stops.length - 1 && <span className="block text-[13px] tm-wk__from">{s.trip.endAtHotel(t(myHotel.name, locale))}</span>}
                            {myHotel && stop.kind === 'hotel' && <span className="block text-[13px] tm-wk__from">{s.trip.nightAway(t(myHotel.name, locale))}</span>}
                          </span>
                        </button>
                        {active && (
                          <div className="mt-1 flex flex-wrap gap-2 pl-12">
                            <a href={directions(i).href} target="_blank" rel="noopener" className="tm-button tm-button--small tm-button--quiet">{directions(i).label}</a>
                            {partners.map((p) => (
                              <a key={p} href={buildOutboundUrl(p, stop.links[p]!, subIdFor(`${cityId}-trip-${route.id}`, stop.id), nightAt(stop))} target="_blank" rel="noopener sponsored" className="tm-button tm-button--small">{p}</a>
                            ))}
                            {stop.search && partners.length === 0 && (['agoda', 'booking'] as const).map((p) => (
                              <a key={p} href={hotelSearchUrl(p, stop.search!, subIdFor(`${cityId}-trip-${route.id}`, stop.id), nightAt(stop))} target="_blank" rel="noopener sponsored" className="tm-button tm-button--small">{s.trip.searchOn(p.charAt(0).toUpperCase() + p.slice(1))}</a>
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
          <SiteFooter locale={locale} cityId={cityId} compact />
        </aside>
      </main>
    </div>
  )
}
