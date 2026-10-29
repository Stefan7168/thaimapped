'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, CalendarPlus, Printer, Share2 } from 'lucide-react'
import type { Locale, RouteStop, TripRoute } from '@/lib/content/types'
import type { AirportLeg } from '@/lib/transit/from-airport'
import { rideSentence } from '@/components/stay/from-airport'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { buildOutboundUrl, hotelSearchUrl, subIdFor, type Partner } from '@/lib/links/build'
import { TRAVEL_MODE, dayDirectionsUrl, directionsUrl } from '@/lib/links/directions'
import type { HotelDoor } from '@/lib/content/slim'
import { useSaved } from '@/lib/saved/store'
import { myHotelAcross, useHotelChoiceVersion } from '@/lib/saved/my-hotel'
import { formatDay, formatDayRange } from '@/lib/stay/format'
import { addDays, adoptStayFromUrl, nights, stayParam, tripStartDefault, tripStartOptions, useStay } from '@/lib/stay/store'
import { buildIcs, downloadIcs, type CalendarEvent } from '@/lib/stay/calendar'
import { StayPicker } from '@/components/stay/stay-picker'
import { STOP_COLORS } from '@/components/map/trip-map'
import { legKm, tripLegs } from '@/lib/explorer/trip-legs'
import { seasonOf } from '@/lib/stay/season'
import { WALK_PACE_M_PER_MIN } from '@/lib/explorer/filters'
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
  // The reader's hotel in the city (the home area's chosen one, else the last saved): the trip then starts and ends at its door.
  const myHotel = useMemo(() => myHotelAcross(hotelDoors, saved)?.hotel ?? null,
    // choiceVersion is read so a new choice recomputes the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hotelDoors, saved, choiceVersion])
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
  const legs = useMemo(() => tripLegs(route), [route])
  // The whole day as one Google Maps route: its stops in order, the saved hotel at either end of the trip's first and last day.
  const dayRouteUrl = (d: number): string | null => {
    const stops = route.stops.filter((st) => st.day === d)
    const points = stops.map((st) => st.location)
    if (myHotel && d === 1 && stops[0]?.kind === 'start') points[0] = myHotel.location
    if (myHotel && d === route.days && stops[stops.length - 1]?.kind === 'end') points[points.length - 1] = myHotel.location
    return dayDirectionsUrl(points, TRAVEL_MODE[route.mode])
  }
  // The day's driving: every leg into a stop of that day (the first stop of day 2 is reached on day 2).
  const dayKm = (d: number): number | null => {
    if (route.mode === 'walk') return null
    const m = route.stops.reduce((sum, stop, i) => (stop.day === d && i > 0 ? sum + legs[i].m : sum), 0)
    return m >= 1000 ? Math.round(m / 1000) : null
  }
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle')
  // A multi-day trip inside the stay starts on a day of the reader's choosing (?start=, or the chips); by default the latest day that is back by check-out.
  const [pickedStart, setPickedStart] = useState<string | null>(null)
  const startOptions = useMemo(() => (stay && route.days > 1 ? tripStartOptions(stay, route.days) : []), [stay, route.days])
  const startIso = stay ? (pickedStart && startOptions.includes(pickedStart) ? pickedStart : tripStartDefault(stay, route.days)) : null
  const dayIso = (d: number): string | null => (startIso ? addDays(startIso, d - 1) : null)
  // With dates set, day N is the start date plus N - 1, shown beside the day heading as the weekend page does.
  const dayDate = (d: number): string | null => {
    const date = dayIso(d)
    return date ? formatDay(date, locale) : null
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
  // The road night keeps the party: only the dates change to that one night.
  const nightAt = (stop: RouteStop) => (startIso && stop.kind === 'hotel' ? { ...stay, checkIn: addDays(startIso, stop.day - 1), checkOut: addDays(startIso, stop.day) } : stay)
  // The trip as a calendar file: one all-day-ish event per day (08:00 to 20:00 Bangkok), the day's stops in the description. Needs the dates.
  const addToCalendar = () => {
    if (!stay) return
    const url = window.location.href.split('#')[0]
    const name = t(route.name, locale)
    const events: CalendarEvent[] = days.map((d) => {
      const iso = dayIso(d)!
      const stops = route.stops.filter((st) => st.day === d)
      // Each stop carries the leg into it, as on the page, so the event reads as the day's route.
      const legText = (st: RouteStop): string => {
        const leg = legs[route.stops.indexOf(st)]
        if (!leg || leg.m < 150) return ''
        return ` (${route.mode === 'walk' ? s.trip.legWalk(Math.max(1, Math.round(leg.m / WALK_PACE_M_PER_MIN))) : s.trip.legRoad(legKm(leg.m), leg.straight ? 'straight' : route.mode)})`.replace('↓ ', '')
      }
      const stopsText = stops.map((st, i) => `${i + 1}. ${t(st.name, locale)}${legText(st)}: ${t(st.why, locale)}`).join('\n')
      const km = dayKm(d)
      return {
        date: iso, start: '08:00', end: '20:00',
        title: s.trip.calendarDay(name, d, route.days),
        description: [km !== null ? `${s.trip.dayKm(km)} ${s.trip.legNote}` : '', `${s.weekendPage.calendarStops}:`, stopsText, myHotel && d === 1 ? `${s.weekendPage.calendarYourHotel}: ${t(myHotel.name, locale)}` : '', url].filter(Boolean).join('\n'),
        location: stops[0] ? t(stops[0].name, locale) : undefined,
        geo: stops[0]?.location,
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
    // The text names the days and the hotel the trip starts from, so the other person reads the plan before opening it.
    const when = startIso && route.days > 1 ? formatDayRange(startIso, addDays(startIso, route.days - 1), locale) : null
    const text = `${t(route.tagline, locale)} ${route.duration === 'multi-day' ? s.trip.days(route.days) : s.trip.duration[route.duration]} · ${s.trip.mode[route.mode].toLowerCase()}${route.distanceKm !== undefined ? ` · ${s.trip.km(route.distanceKm)}` : ''}${when ? ` · ${when}` : ''}${myHotel ? ` · ${s.trip.shareFromHotel(t(myHotel.name, locale))}` : ''}.`
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
    <div className="flex h-dvh flex-col tm-trip">
      <header className="flex items-center gap-3 bg-paper-2 px-3 py-2 md:px-4">
        <Link href={`/${locale}`} className="tm-wordmark shrink-0">{s.brand}</Link>
        <Link href={`/${locale}/${cityId}`} className="tm-link ml-auto flex items-center gap-1 text-[15px]">
          <ArrowLeft aria-hidden="true" className="size-4" />
          {cityName}
        </Link>
      </header>
      <main className="flex min-h-0 flex-1 flex-col md:flex-row">
        <div className="relative order-1 min-h-[45dvh] flex-1 md:min-h-0 tm-trip__map" data-ui>
          <TripMap locale={locale} route={route} day={day} activeStopId={activeStop} onSelectStop={(id) => setActiveStop(id)} hoverStopId={hoverStop} onHoverStop={setHoverStop} />
          {!route.path && (
            <p className="pointer-events-none absolute inset-x-3 bottom-3 bg-paper px-3 py-2 text-[15px] text-ink-2 md:right-auto md:max-w-sm">{s.trip.pathNote}</p>
          )}
        </div>
        <aside className="order-2 max-h-[55dvh] overflow-y-auto bg-paper md:max-h-none md:w-[24rem] tm-trip__aside">
          <div className="p-4">
            <h1 className="font-display text-[28px] font-semibold leading-tight tracking-tight">{t(route.name, locale)}</h1>
            <p className="mt-2 text-[17px] leading-normal">{t(route.tagline, locale)}</p>
            <p className="mt-3 flex flex-wrap gap-2 text-[15px] text-ink-2">
              <span className="bg-paper-2 px-2 py-0.5">{s.trip.duration[route.duration]}</span>
              {route.duration === 'multi-day' && <span className="bg-paper-2 px-2 py-0.5">{s.trip.days(route.days)}</span>}
              <span className="bg-paper-2 px-2 py-0.5">{s.trip.mode[route.mode]}</span>
              {route.distanceKm !== undefined && <span className="bg-paper-2 px-2 py-0.5">{s.trip.km(route.distanceKm)}</span>}
            </p>
            <p className="mt-3 flex flex-wrap gap-2 tm-trip__tools">
              <button type="button" onClick={share} className="tm-button tm-button--small tm-button--quiet">
                <Share2 aria-hidden="true" className="size-4" />
                {shared === 'copied' ? s.trip.copied : shared === 'failed' ? s.trip.copyFailed : s.trip.share}
              </button>
              {stay && (
                <button type="button" onClick={addToCalendar} className="tm-button tm-button--small tm-button--quiet ">
                  <CalendarPlus aria-hidden="true" className="size-4" />
                  {s.weekendPage.calendar}
                </button>
              )}
              <button type="button" onClick={() => window.print()} className="tm-button tm-button--small tm-button--quiet ">
                <Printer aria-hidden="true" className="size-4" />
                {s.trip.print}
              </button>
            </p>
            {startIso && (
              // Paper only: the start chips and hotel line are screen controls, so the printout states the dates and the hotel in one line.
              <p className="tm-wk__paper mt-3">{[route.days > 1 ? formatDayRange(startIso, addDays(startIso, route.days - 1), locale) : formatDay(startIso, locale), myHotel ? s.trip.shareFromHotel(t(myHotel.name, locale)) : null].filter(Boolean).join(' · ')}</p>
            )}
            {startIso && seasonOf(cityId, startIso) && <p className="mt-3 tm-wk__season" title={s.weekendPage.seasonNote}>{s.weekendPage.season[seasonOf(cityId, startIso)!]}</p>}
            {/* The dates, as on the weekend and station pages: with them the days get dates, the road hotel its night, the calendar its file. */}
            <div className="mt-4"><StayPicker locale={locale} /></div>
            {/* A trip longer than the stay says so here too, as the trips index does; the days still get dates from check-in. */}
            {stay && route.days > nights(stay) + 1 && <p className="mt-3 text-[15px] tm-wk__from">{s.trip.tooLong(nights(stay))}</p>}
            {startOptions.length > 1 && (
              <p className="mt-4 flex flex-wrap items-center gap-1.5 text-[15px] text-ink-2 tm-trip__tools">
                <span className="mr-1">{s.trip.startOn}</span>
                {startOptions.map((date) => (
                  <button key={date} type="button" aria-pressed={startIso === date} onClick={() => setPickedStart(date)} className={`tm-chip${startIso === date ? ' tm-chip--on' : ''}`}>{formatDay(date, locale)}</button>
                ))}
              </p>
            )}
            {route.days > 1 && (
            <div className="mt-4 flex gap-1.5 tm-trip__tools">
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
                {route.days > 1 && <h2 className="text-[17px] font-semibold">{s.trip.day(d)}{dayDate(d) && <span className="tm-wk__date"> · {dayDate(d)}</span>}{dayKm(d) !== null && <span className="tm-wk__date" title={s.trip.legNote}> · {s.trip.dayKm(dayKm(d)!)}</span>}{isToday(d) && <span className="tm-wk__now">{s.trip.today}</span>}</h2>}
                <ol className="mt-2 space-y-1.5">
                  {route.stops.map((stop, i) => {
                    if (stop.day !== d) return null
                    const active = stop.id === activeStop
                    const partners = Object.keys(stop.links) as Partner[]
                    const leg = legs[i]
                    return (
                      <li key={stop.id}>
                        {i > 0 && leg.m >= 150 && <span className="tm-stoprow__leg" title={leg.straight ? s.stationPage.estimated : s.trip.legNote}>{route.mode === 'walk' ? s.trip.legWalk(Math.max(1, Math.round(leg.m / WALK_PACE_M_PER_MIN))) : s.trip.legRoad(legKm(leg.m), leg.straight ? 'straight' : route.mode)}</span>}
                        <button type="button" onClick={() => setActiveStop(active ? null : stop.id)} onMouseEnter={() => setHoverStop(stop.id)} onMouseLeave={() => setHoverStop(null)} onFocus={() => setHoverStop(stop.id)} onBlur={() => setHoverStop(null)} className={`tm-stoprow${active ? ' tm-stoprow--on' : ''}${hoverStop === stop.id ? ' tm-stoprow--hover' : ''}`}>
                          <span className="tm-stoprow__num" style={{ ['--lc' as string]: STOP_COLORS[stop.kind] }}>{i + 1}</span>
                          <span className="min-w-0">
                            <span className="flex items-center gap-2">
                              <span className="text-[15px] text-ink-2">{s.stop[stop.kind]}</span>
                              <span className="truncate text-[17px] font-medium">{t(stop.name, locale)}</span>
                            </span>
                            <span className="block text-[16px] text-ink">{t(stop.why, locale)}</span>
                            {stop.placeholder && <span className="tm-stoprow__tbc">{s.trip.placeholder}</span>}
                            {stop.search && <span className="block text-[13px] text-ink-2 tm-stoprow__search">{s.trip.searchHotels(stop.search, !!stay)}</span>}
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
                {dayRouteUrl(d) && <p className="mt-2"><a href={dayRouteUrl(d)!} target="_blank" rel="noopener" className="tm-link tm-link--under text-[14px]">{route.days > 1 ? s.trip.openDay(d) : s.trip.openWholeTrip}</a></p>}
              </section>
            ))}
          </div>
          <SiteFooter locale={locale} cityId={cityId} compact />
        </aside>
      </main>
    </div>
  )
}
