'use client'

import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import { ArrowLeft, Bookmark, CalendarDays, CalendarPlus, Printer, Share2 } from 'lucide-react'
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
import { addDays, adoptStayFromUrl, dayTripOptions, nights, stayParam, tripStartDefault, tripStartOptions, useStay } from '@/lib/stay/store'
import { keepTrip, setTripStartPick, tripClashes, useTripStartPicks } from '@/lib/stay/trip-start'
import { buildIcs, downloadIcs, TRIP_HOURS, type CalendarEvent } from '@/lib/stay/calendar'
import { useKeptTrips } from '@/lib/saved/trips'
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
/** The other trips of the city, slimmed: enough to say which kept ones run in the same hours on a day. */
export type OtherTrip = Pick<TripRoute, 'id' | 'name' | 'days' | 'duration'>

export function TripPage({ locale, cityId, cityName, route, hotelDoors = {}, startRides = {}, others = [] }: { locale: Locale; cityId: string; cityName: string; route: TripRoute; hotelDoors?: Record<string, HotelDoor[]>; startRides?: Record<string, Record<string, AirportLeg[] | null>>; others?: OtherTrip[] }) {
  const s = strings(locale)
  const stay = useStay()
  const saved = useSaved()
  const choiceVersion = useHotelChoiceVersion()
  // The reader's hotel in the city (the home area's chosen one, else the last saved): the trip then starts and ends at its door.
  const mine = useMemo(() => myHotelAcross(hotelDoors, saved),
    // choiceVersion is read so a new choice recomputes the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hotelDoors, saved, choiceVersion])
  const myHotel = mine?.hotel ?? null
  const mode = TRAVEL_MODE[route.mode]
  // Getting from the hotel to a walking or boat trip is a train ride, not a walk across the city; a car trip drives from the door.
  const hotelMode = mode === 'driving' ? 'driving' : 'transit'
  // The line under the first stop: the rail ride from the hotel when the trip starts at a station, else just the hotel's name.
  function startLine(stop: RouteStop): string {
    const name = t(myHotel!.name, locale)
    if (noRoom) return s.trip.startNoRoom(name)
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
  // A day with a straight-line leg in it (a stop the drawn road never reaches) is a floor, not a measurement: "at least".
  const dayKm = (d: number): number | null => {
    if (route.mode === 'walk') return null
    const m = route.stops.reduce((sum, stop, i) => (stop.day === d && i > 0 ? sum + legs[i].m : sum), 0)
    return m >= 1000 ? Math.round(m / 1000) : null
  }
  const dayHasStraight = (d: number): boolean => route.stops.some((stop, i) => stop.day === d && i > 0 && legs[i].straight && legs[i].m >= 150)
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle')
  // A multi-day trip inside the stay starts on a day of the reader's choosing (?start=, or the chips); by default the latest day that is back by check-out.
  // The pick is kept in this browser (and read back on the weekend and saved pages); ?start= from a shared link wins for this visit.
  const [sentStart, setSentStart] = useState<string | null>(null)
  const picks = useTripStartPicks()
  const pickedStart = sentStart ?? picks[route.id] ?? null
  const setPickedStart = (date: string) => {
    setSentStart(null)
    setTripStartPick(route.id, date)
  }
  const keptIds = useKeptTrips()
  const kept = keptIds.includes(route.id)
  // The other kept trips that would run in the same hours if this trip started on a day: the chip says so, and a note names them for the current day.
  const clashOn = (date: string): OtherTrip[] => (stay ? tripClashes<OtherTrip>(stay, route, others.filter((o) => keptIds.includes(o.id)), { ...picks, [route.id]: date }) : [])
  // A kept trip links to the weekend page of the hotel's area, at the slot it takes (Friday-to-Sunday stays carry slot dates; other stays open the page top).
  const weekendHref = (): string | null => {
    if (!kept || !mine || !stay || !startIso) return null
    const base = `/${locale}/${cityId}/weekend/${mine.areaId}`
    if (nights(stay) !== 2 || new Date(stay.checkIn + 'T00:00:00').getDay() !== 5) return base
    const offset = Math.round((Date.UTC(+startIso.slice(0, 4), +startIso.slice(5, 7) - 1, +startIso.slice(8, 10)) - Date.UTC(+stay.checkIn.slice(0, 4), +stay.checkIn.slice(5, 7) - 1, +stay.checkIn.slice(8, 10))) / 86400000)
    const slot = offset === 0 ? 'fridayNight' : offset === 2 ? 'sunday' : route.duration === 'afternoon' ? 'saturdayAfternoon' : route.duration === 'evening' ? 'saturdayNight' : 'saturdayMorning'
    return `${base}#tm-slot-${slot}`
  }
  // A multi-day trip starts on any day that gets you back by check-out; a day trip on any day of the stay its time of day fits (none for a full day in a one-night stay).
  const startOptions = useMemo(() => (stay ? (route.days > 1 ? tripStartOptions(stay, route.days) : dayTripOptions(stay, route.duration)) : []), [stay, route.days, route.duration])
  const startIso = stay ? (pickedStart && startOptions.includes(pickedStart) ? pickedStart : route.days > 1 ? tripStartDefault(stay, route.days) : (startOptions[startOptions.length - 1] ?? null)) : null
  // The trip's last day falls on the stay's check-out day: the room is done before the trip ends.
  const endsOnCheckout = route.days > 1 && !!stay && !!startIso && addDays(startIso, route.days - 1) >= stay.checkOut
  // Every night of the stay is spent on this trip, so the hotel is never slept in.
  const noRoom = !!stay && !!startIso && startIso <= stay.checkIn && endsOnCheckout
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
      if (sent && /^\d{4}-\d{2}-\d{2}$/.test(sent)) setSentStart(sent)
    })
    return () => window.cancelAnimationFrame(id)
  }, [])
  // The start chips exist only once the stay is read in the browser, so a #tm-start link (from the saved list's "Pick another day") scrolls to them here.
  const chipCount = startOptions.length
  useEffect(() => {
    if (chipCount > 1 && window.location.hash === '#tm-start') document.getElementById('tm-start')?.scrollIntoView({ block: 'center' })
  }, [chipCount])
  // With dates set, the day whose date is today in Bangkok is marked.
  const clock = useSyncExternalStore(noopSubscribe, clockSnapshot, () => null)
  const isToday = (d: number): boolean => !!clock && dayIso(d) === clock.date
  // A hotel stop on the road sleeps that one night, so its search opens on that night, not on the Bangkok stay.
  // The road night keeps the party: only the dates change to that one night.
  // A hotel stop's nights run to the next hotel stop or the trip's last day, so one bed named on day 1 of a three-day trip books two nights.
  const nightAt = (stop: RouteStop) => {
    if (!startIso || stop.kind !== 'hotel') return stay
    const next = route.stops.find((st) => st.kind === 'hotel' && st.day > stop.day)
    return { ...stay, checkIn: addDays(startIso, stop.day - 1), checkOut: addDays(startIso, (next ? next.day : route.days) - 1) }
  }
  // The trip as a calendar file: one event per day in the hours its time of day covers (a morning 08:00 to 13:00, a full day 08:00 to 20:00, Bangkok), the day's stops in the description. Needs the dates.
  const addToCalendar = () => {
    if (!startIso) return
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
        date: iso, start: TRIP_HOURS[route.duration][0], end: TRIP_HOURS[route.duration][1],
        title: s.trip.calendarDay(name, d, route.days),
        description: [km !== null ? (dayHasStraight(d) ? `${s.trip.dayKmAtLeast(km)}, ${s.trip.dayKmNote}` : `${s.trip.dayKm(km)} ${s.trip.legNote}`) : '', `${s.weekendPage.calendarStops}:`, stopsText, myHotel && d === 1 ? `${s.weekendPage.calendarYourHotel}: ${t(myHotel.name, locale)}` : '', url].filter(Boolean).join('\n'),
        location: stops[0] ? t(stops[0].name, locale) : undefined,
        geo: stops[0]?.location,
        url,
      }
    })
    // Each bed on the road is its own evening event on its first night, with the night count, so the nights away stand out from the day routes.
    if (stay) {
      for (const st of route.stops) {
        if (st.kind !== 'hotel') continue
        const at = nightAt(st)!
        const n = nights(at)
        events.push({
          date: at.checkIn, start: '19:00', end: '20:00',
          title: s.trip.calendarSleep(t(st.name, locale), n),
          description: [t(st.why, locale), st.search ? s.trip.searchHotels(st.search, true) : '', url].filter(Boolean).join('\n'),
          location: st.search ?? t(st.name, locale),
          geo: st.location,
          url,
        })
      }
    }
    downloadIcs(`trip-${route.id}.ics`, buildIcs(events, name))
  }

  const share = async () => {
    // The link carries the dates, so the booking links open on the same nights for the other person.
    const u = new URL(window.location.href)
    if (stay) u.searchParams.set('stay', stayParam(stay))
    else u.searchParams.delete('stay')
    if (startIso && startOptions.length > 1) u.searchParams.set('start', startIso)
    else u.searchParams.delete('start')
    const url = u.toString()
    // The text names the days and the hotel the trip starts from, so the other person reads the plan before opening it.
    const when = startIso ? (route.days > 1 ? formatDayRange(startIso, addDays(startIso, route.days - 1), locale) : formatDay(startIso, locale)) : null
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
              <button type="button" aria-pressed={kept} onClick={() => keepTrip<OtherTrip>(stay, route, others.filter((o) => keptIds.includes(o.id)), picks, !kept)} className={`tm-button tm-button--small${kept ? '' : ' tm-button--quiet'}`} title={kept ? s.trip.keptNote : undefined}>
                <Bookmark aria-hidden="true" className="size-4" />
                {kept ? s.trip.kept : s.trip.keep}
              </button>
              {weekendHref() && (
                <Link href={weekendHref()!} className="tm-button tm-button--small tm-button--quiet">
                  <CalendarDays aria-hidden="true" className="size-4" />
                  {s.trip.inYourWeekend}
                </Link>
              )}
              <button type="button" onClick={share} className="tm-button tm-button--small tm-button--quiet">
                <Share2 aria-hidden="true" className="size-4" />
                {shared === 'copied' ? s.trip.copied : shared === 'failed' ? s.trip.copyFailed : s.trip.share}
              </button>
              {startIso && (
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
              <p id="tm-start" className="mt-4 flex flex-wrap items-center gap-1.5 text-[15px] text-ink-2 tm-trip__tools">
                <span className="mr-1">{s.trip.startOn}</span>
                {startOptions.map((date) => (
                  <button key={date} type="button" aria-pressed={startIso === date} onClick={() => setPickedStart(date)} className={`tm-chip${startIso === date ? ' tm-chip--on' : ''}${clashOn(date).length > 0 ? ' tm-chip--busy' : ''}`} title={clashOn(date).length > 0 ? s.saved.sameDay(clashOn(date).map((o) => t(o.name, locale)).join(', ')) : undefined}>{formatDay(date, locale)}</button>
                ))}
              </p>
            )}
            {startIso && clashOn(startIso).length > 0 && (
              <p className="mt-2 text-[15px] tm-wk__from">
                {s.trip.sameHoursAs(clashOn(startIso).map((o) => t(o.name, locale)).join(', '), route.days)}
                {startOptions.some((d) => clashOn(d).length === 0) ? ` ${s.trip.pickFreeDay}` : ''}
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
                {route.days > 1 && <h2 className="text-[17px] font-semibold">{s.trip.day(d)}{dayDate(d) && <span className="tm-wk__date"> · {dayDate(d)}</span>}{dayKm(d) !== null && <span className="tm-wk__date" title={dayHasStraight(d) ? s.trip.dayKmNote : s.trip.legNote}> · {dayHasStraight(d) ? s.trip.dayKmAtLeast(dayKm(d)!) : s.trip.dayKm(dayKm(d)!)}</span>}{isToday(d) && <span className="tm-wk__now">{s.trip.today}</span>}</h2>}
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
                            {myHotel && stop.kind === 'end' && i === route.stops.length - 1 && <span className="block text-[13px] tm-wk__from">{endsOnCheckout ? s.trip.endOnCheckout(t(myHotel.name, locale)) : s.trip.endAtHotel(t(myHotel.name, locale))}</span>}
                            {stop.kind === 'hotel' && startIso && stay && (() => {
                              const at = nightAt(stop)!
                              const n = nights(at)
                              return <span className="block text-[13px] text-ink-2">{s.trip.stopNights(n, n > 1 ? formatDayRange(at.checkIn, at.checkOut, locale) : formatDay(at.checkIn, locale))}</span>
                            })()}
                            {myHotel && stop.kind === 'hotel' && <span className="block text-[13px] tm-wk__from">{s.trip.nightAway(t(myHotel.name, locale), startIso && stay ? nights(nightAt(stop)!) : 1)}</span>}
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
                {dayRouteUrl(d) && <p className="mt-2 tm-trip__dayroute"><a href={dayRouteUrl(d)!} target="_blank" rel="noopener" className="tm-link tm-link--under text-[14px]">{route.days > 1 ? s.trip.openDay(d) : s.trip.openWholeTrip}</a></p>}
              </section>
            ))}
          </div>
          <SiteFooter locale={locale} cityId={cityId} compact />
        </aside>
      </main>
    </div>
  )
}
