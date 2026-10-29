'use client'

import dynamic from 'next/dynamic'
import Image from 'next/image'
import Link from 'next/link'
import { Fragment, useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from 'react'
import { CalendarPlus, Printer, Share2 } from 'lucide-react'
import type { Area, Locale, Pin, Station, TripRoute } from '@/lib/content/types'
import { FromAirport } from '@/components/stay/from-airport'
import type { AirportLeg, AirportRoutes } from '@/lib/transit/from-airport'
import { rideSentence, rideShort } from '@/components/stay/from-airport'
import type { HotelDoor } from '@/lib/content/slim'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { distanceM, isFullRange, PRICE_RANGE, WALK_PACE_M_PER_MIN, type PriceRange } from '@/lib/explorer/filters'
import { WEEKEND_SLOTS, weekendPlan, slotNow, type WeekendSlot, SLOT_TIMES, type BorrowedSlot } from '@/lib/explorer/weekend'
import { bangkokClock, whenLine } from '@/lib/explorer/when'
import { thb } from '@/lib/explorer/price'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { dayDirectionsUrl, directionsUrl } from '@/lib/links/directions'
import { formatDay, formatDayRange } from '@/lib/stay/format'
import { seasonOf } from '@/lib/stay/season'
import { addDays, adoptStayFromUrl, dayTripOptions, adultsOf, childrenOf, daysUntil, iso, nights, roomsOf, stayParam, tripStartDefault, useStay } from '@/lib/stay/store'
import { buildIcs, downloadIcs, TRIP_HOURS, type CalendarEvent } from '@/lib/stay/calendar'
import { trackOutbound } from '@/lib/links/track'
import { supports3D } from '@/lib/map/device'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'
import { SaveButton } from '@/components/saved/save-button'
import { StayPicker } from '@/components/stay/stay-picker'
import { HotelCompare } from '@/components/stay/hotel-compare'
import { addSaved, useSaved } from '@/lib/saved/store'
import { chooseHotel, useMyHotelChoice } from '@/lib/saved/my-hotel'
import { toggleKeptTrip, useKeptTrips } from '@/lib/saved/trips'
import { HotelElsewhere, useHotelElsewhere } from '@/components/stay/hotel-elsewhere'
import { skipStop, unskipStops, useSkipped } from '@/lib/saved/skipped'
import { KIND_ICONS } from '@/components/explorer/kind-bar'

const StageMap = dynamic(() => import('@/components/map/stage-map').then((m) => m.StageMap), {
  ssr: false,
  loading: () => <div className="h-full w-full bg-paper" />,
})

const noopSubscribe = () => () => {}
// Bangkok's clock, read once in the browser; the server renders no "Now".
let clockCache: ReturnType<typeof bangkokClock> | null = null
const clockSnapshot = () => clockCache ?? (clockCache = bangkokClock())

/** `?price=min-max` from the address bar, clamped to the slider's range; null when absent or the full range. */
function readPrice(): PriceRange | null {
  const m = new URLSearchParams(window.location.search).get('price')?.match(/^(\d+)-(\d+)$/)
  if (!m) return null
  const r = { min: Math.max(PRICE_RANGE.min, Number(m[1])), max: Math.min(PRICE_RANGE.max, Number(m[2])) }
  return r.min < r.max && !isFullRange(r) ? r : null
}

/**
 * One area's weekend as a page of its own: the plan from Friday night to
 * Sunday, the hotels inside the budget, the same map at the side, and a
 * link anyone can share. The page is static; the budget rides in the URL.
 */
export function WeekendPage({ locale, cityId, area, areas, stations, routes, borrowed = {}, airport = {}, rides = {}, hotelDoors = {}, elsewhereRides = {}, tripStarts = {}, tripRides = {}, stopRides = {} }: { locale: Locale; cityId: string; area: Area; areas: Area[]; stations: Station[]; routes: TripRoute[]; borrowed?: Partial<Record<WeekendSlot, BorrowedSlot>>; airport?: Record<string, AirportRoutes>; rides?: Record<string, Record<string, AirportLeg[] | null>>; hotelDoors?: Record<string, HotelDoor[]>; elsewhereRides?: Record<string, Record<string, AirportLeg[] | null>>; tripStarts?: Record<string, string>; tripRides?: Record<string, Record<string, AirportLeg[] | null>>; stopRides?: Record<string, Record<string, AirportLeg[] | null>> }) {
  const s = strings(locale)
  const stay = useStay()
  const detected3D = useSyncExternalStore(noopSubscribe, supports3D, () => null)
  const clock = useSyncExternalStore(noopSubscribe, clockSnapshot, () => null)
  const [price, setPrice] = useState<PriceRange | null>(null)
  // A hotel named in the address ("?hotel=") by whoever sent the link: used as theirs for this visit, never saved.
  const [sentHotel, setSentHotel] = useState<string | null>(null)
  // Stops the sender took out ("?skip="): left out for this visit, never written to this browser's own list.
  const [sentSkips, setSentSkips] = useState<readonly string[]>([])
  // Trips the sender had kept ("?trips="): marked and listed first for this visit, never written to this browser's own list.
  const [sentTrips, setSentTrips] = useState<readonly string[]>([])
  const keptTrips = useKeptTrips()
  // The trips in this plan: the sender's on a shared link, else this browser's kept ones. They come first and go into the calendar file.
  const planTrips = sentTrips.length > 0 ? sentTrips : keptTrips
  // With two or more hotels of this area saved, the reader can say which one the plan walks from (kept per area in this browser).
  const chosenHotel = useMyHotelChoice(area.id)
  // The address is not known on the server; read it once the page is live.
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      setPrice(readPrice())
      setSentHotel(new URLSearchParams(window.location.search).get('hotel'))
      setSentSkips((new URLSearchParams(window.location.search).get('skip') ?? '').split(',').filter(Boolean))
      setSentTrips((new URLSearchParams(window.location.search).get('trips') ?? '').split(',').filter(Boolean))
      adoptStayFromUrl()
    })
    return () => window.cancelAnimationFrame(id)
  }, [])
  // Stops the reader took out: the plan refills from the area's other places.
  const skipped = useSkipped()
  const skippedHere = useMemo(() => area.pins.filter((p) => p.kind !== 'hotel' && (skipped.includes(p.id) || sentSkips.includes(p.id))), [area, skipped, sentSkips])
  const plan = useMemo(() => weekendPlan(area, price, new Set([...skipped, ...sentSkips])), [area, price, skipped, sentSkips])
  const [card, setCard] = useState<{ pin: Pin; area: Area } | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed'>('idle')
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])
  const stops = useMemo(() => WEEKEND_SLOTS.flatMap((slot) => plan.slots[slot]), [plan])
  // A hotel the reader saved comes first under "Where to sleep".
  const saved = useSaved()
  const hotels = useMemo(() => [...plan.hotels].sort((a, b) => Number(saved.includes(b.id)) - Number(saved.includes(a.id))), [plan.hotels, saved])
  const pinned = useMemo(() => [...stops, ...hotels], [stops, hotels])
  // The hotel the reader saved (hearted) in this area: every stop then says how far it is from that door.
  const myHotel = useMemo(() => hotels.find((h) => h.id === sentHotel) ?? hotels.find((h) => h.id === chosenHotel && saved.includes(h.id)) ?? hotels.find((h) => saved.includes(h.id)) ?? null, [hotels, saved, sentHotel, chosenHotel])
  // Stable map props: a new object on every render would rebuild the markers and re-frame the map on each hover or card change.
  const mapAreas = useMemo(() => [area], [area])
  const focus = useMemo(() => ({ pins: pinned, area, numbered: true, mine: myHotel?.id }), [pinned, area, myHotel?.id])
  const elsewhere = useHotelElsewhere(area, areas, hotelDoors, elsewhereRides, saved, !!myHotel, locale, chosenHotel)
  // A stop more than twenty minutes on foot from the hotel, when both walk from a station and the chain is a real ride.
  const byTrain = (pin: Pin): string | null => {
    if (!myHotel?.walk || !pin.walk || pin.walk.station === myHotel.walk.station) return null
    const legs = rides[myHotel.walk.station]?.[pin.walk.station]
    return legs && legs.length > 0 ? rideSentence(legs, pin.walk.minutes, locale) : null
  }
  /** The ride from the saved hotel to a day trip's start, when the trip starts at a station the hotel does not walk from. */
  function tripByTrain(routeId: string): string | null {
    const start = tripStarts[routeId]
    if (!myHotel?.walk || !start) return null
    if (start === myHotel.walk.station) return s.weekendPage.tripAtYourStation
    const legs = tripRides[myHotel.walk.station]?.[start]
    return legs && legs.length > 0 ? s.weekendPage.byTrainFrom(t(myHotel.name, locale), rideSentence(legs, null, locale)) : null
  }
  // With the hotel in another area: the ride from its station to this place's station, then the walk; the directions start at that door by train.
  // Sleeping in another area, every stop is a train ride: the stop's line is the short form (the box above already names the hotel's line and station), the full ride sits in its title.
  const byTrainElsewhere = (pin: Pin): { short: string; long: string } | null => {
    const hotel = elsewhere?.hotel
    if (myHotel || !hotel?.walk || !pin.walk) return null
    const legs = elsewhereRides[hotel.walk.station]?.[pin.walk.station]
    return legs && legs.length > 0 ? { short: s.weekendPage.byTrainFrom(t(hotel.name, locale), rideShort(legs, pin.walk.minutes, locale)), long: s.weekendPage.byTrainFrom(t(hotel.name, locale), rideSentence(legs, pin.walk.minutes, locale)) } : null
  }
  const fromHotel = (pin: Pin) => (myHotel ? Math.max(1, Math.round(distanceM(myHotel.location.lon, myHotel.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN)) : null)
  // Stops of this weekend inside a ten-minute walk of a hotel, straight-line at walking pace.
  const nearbyCount = (hotel: Pin) => stops.filter((p) => distanceM(hotel.location.lon, hotel.location.lat, p.location.lon, p.location.lat) <= WALK_PACE_M_PER_MIN * 10).length
  // The slot it is right now in Bangkok, during the stay (or any weekend when no dates are set): marked "Now", with a jump to it.
  const nowSlot = clock ? slotNow(clock, stay) : null
  // With a Friday-to-Sunday stay picked, each slot heading carries its date.
  const slotDay = (slot: WeekendSlot): Date | null => {
    if (!stay || nights(stay) !== 2) return null
    const d = new Date(stay.checkIn + 'T00:00:00')
    if (d.getDay() !== 5) return null
    d.setDate(d.getDate() + (slot === 'fridayNight' ? 0 : slot === 'sunday' ? 2 : 1))
    return d
  }
  // The slot that falls on check-out day (Sunday of a Friday-to-Sunday stay): the heading says so, as the bags come along.
  const isCheckOutDay = (slot: WeekendSlot): boolean => {
    const d = slotDay(slot)
    return !!d && !!stay && iso(d) === stay.checkOut
  }
  const slotDate = (slot: WeekendSlot): string | null => {
    const d = slotDay(slot)
    return d ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).format(d) : null
  }
  // The plan as a calendar file: one event per slot, Bangkok time, the stops in the description.
  const SLOT_HOURS: Record<WeekendSlot, [string, string]> = { fridayNight: ['18:00', '22:00'], saturdayMorning: ['09:00', '12:00'], saturdayAfternoon: ['13:00', '17:00'], saturdayNight: ['18:00', '22:00'], sunday: ['10:00', '16:00'] }
  const addToCalendar = () => {
    const areaName = t(area.name, locale)
    const url = window.location.href.split('#')[0]
    const hotelLine = myHotel ? `${s.weekendPage.calendarYourHotel}: ${t(myHotel.name, locale)}` : hotels.length ? `${s.weekendPage.calendarHotel}: ${hotels.map((h) => t(h.name, locale)).join(', ')}` : ''
    const events: CalendarEvent[] = WEEKEND_SLOTS.flatMap((slot) => {
      const d = slotDay(slot)
      const items = plan.slots[slot]
      if (!d || items.length === 0) return []
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      // Each stop after the first carries the walk from the one before, as on the page.
      const walkText = (p: Pin, i: number): string => (i === 0 ? '' : ` (${s.weekendPage.legWalk(Math.max(1, Math.round(distanceM(items[i - 1].location.lon, items[i - 1].location.lat, p.location.lon, p.location.lat) / WALK_PACE_M_PER_MIN)), t(items[i - 1].name, locale)).replace('↓ ', '')})`)
      const stopsText = items.map((p, i) => `${i + 1}. ${t(p.name, locale)}${walkText(p, i)}: ${t(p.why, locale)}`).join('\n')
      return [{
        date, start: SLOT_HOURS[slot][0], end: SLOT_HOURS[slot][1],
        title: `${s.guide.slots[slot]}, ${areaName}`,
        description: [`${s.weekendPage.calendarStops}:`, stopsText, hotelLine, url].filter(Boolean).join('\n'),
        location: `${t(items[0].name, locale)}, ${areaName}`,
        geo: items[0].location,
        url,
      }]
    })
    // The hotel's own two moments, so the weekend reads as one row in the calendar; times are the usual ones, the booking has the real ones.
    if (myHotel && stay) {
      const name = t(myHotel.name, locale)
      events.push(
        { date: stay.checkIn, start: '14:00', end: '15:00', title: s.weekendPage.calendarCheckIn(name), description: [s.weekendPage.calendarTimesVary, url].join('\n'), location: `${name}, ${areaName}`, geo: myHotel.location, url },
        { date: stay.checkOut, start: '11:00', end: '12:00', title: s.weekendPage.calendarCheckOut(name), description: [s.weekendPage.calendarTimesVary, url].join('\n'), location: `${name}, ${areaName}`, geo: myHotel.location, url },
      )
    }
    // Kept trips, on the day of the stay each fits (the trip page's default day), in the hours of their time of day.
    if (stay) {
      for (const r of routes.filter((x) => planTrips.includes(x.id))) {
        const day = r.days > 1 ? (r.days <= nights(stay) + 1 ? tripStartDefault(stay, r.days) : null) : (dayTripOptions(stay, r.duration).at(-1) ?? null)
        if (!day) continue
        const tripUrl = `${window.location.origin}/${locale}/${cityId}/trip/${r.id}`
        for (let d = 1; d <= r.days; d++) {
          const first = r.stops.find((st) => st.day === d) ?? r.stops[0]
          events.push({ date: addDays(day, d - 1), start: TRIP_HOURS[r.duration][0], end: TRIP_HOURS[r.duration][1], title: s.trip.calendarDay(t(r.name, locale), d, r.days), description: [t(r.tagline, locale), tripUrl].join('\n'), location: first ? t(first.name, locale) : undefined, geo: first?.location, url: tripUrl })
        }
      }
    }
    downloadIcs(`weekend-${area.id}.ics`, buildIcs(events, s.weekendPage.calendarName(areaName)))
  }
  const priceQuery = price ? `price=${price.min}-${price.max}` : ''
  const explorerHref = `/${locale}/${cityId}#area=${area.id}${priceQuery ? `&${priceQuery}` : ''}`

  const share = async () => {
    // The link carries the budget (already in the address) and the dates, so the other person sees the same plan.
    const u = new URL(window.location.href)
    if (stay) u.searchParams.set('stay', stayParam(stay))
    else u.searchParams.delete('stay')
    if (myHotel) u.searchParams.set('hotel', myHotel.id)
    else u.searchParams.delete('hotel')
    if (skippedHere.length > 0) u.searchParams.set('skip', skippedHere.map((p) => p.id).join(','))
    else u.searchParams.delete('skip')
    const sharedTrips = routes.filter((r) => keptTrips.includes(r.id))
    if (sharedTrips.length > 0) u.searchParams.set('trips', sharedTrips.map((r) => r.id).join(','))
    else u.searchParams.delete('trips')
    const url = u.toString()
    const title = s.weekendPage.title(t(area.name, locale))
    // The share sheet's text names the hotel and the dates, so the message reads as a plan, not a bare link.
    const dates = stay ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).formatRange(new Date(`${stay.checkIn}T12:00:00`), new Date(`${stay.checkOut}T12:00:00`)) : null
    // The party rides along when it is not the default pair, so "3 adults, 1 child" reads in the message as well as in the link.
    const party = stay && (adultsOf(stay) !== 2 || childrenOf(stay) > 0) ? s.stay.adults(adultsOf(stay), 1, childrenOf(stay)) : null
    const text = s.weekendPage.shareText(t(area.name, locale), myHotel ? t(myHotel.name, locale) : null, dates ? [dates, party].filter(Boolean).join(', ') : null) + (sharedTrips.length > 0 ? s.weekendPage.shareTrips(sharedTrips.map((r) => t(r.name, locale)).join(', ')) : '')
    try {
      if (navigator.share) {
        await navigator.share({ title, text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch {
      setShared('failed')
    }
    window.setTimeout(() => setShared('idle'), 2500)
  }

  const stop = (pin: Pin) => {
    const n = pinned.findIndex((p) => p.id === pin.id) + 1
    const photo = pin.photos?.[0] ?? pin.photo
    const KindIcon = KIND_ICONS[pin.kind]
    const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
    const on = card?.pin.id === pin.id
    return (
      <li key={pin.id} className="tm-wk__item">
        {<SaveButton id={pin.id} locale={locale} className="tm-wk__save" />}
        <button type="button" aria-pressed={on} onClick={() => { setCard(on ? null : { pin, area }); if (!on) showMap() }} onMouseEnter={() => setHoverId(pin.id)} onMouseLeave={() => setHoverId(null)} onFocus={() => setHoverId(pin.id)} onBlur={() => setHoverId(null)} className={`tm-wk__stop${on ? ' tm-wk__stop--on' : ''}${hoverId === pin.id ? ' tm-wk__stop--hover' : ''}${myHotel?.id === pin.id ? ' tm-wk__stop--mine' : ''}`}>
          {photo ? (
            <Image src={photo.src} alt="" width={72} height={72} sizes="72px" className="tm-wk__thumb" />
          ) : (
            <span aria-hidden="true" className="tm-wk__thumb tm-wk__thumb--empty"><KindIcon className="size-6" /></span>
          )}
          <span className="tm-wk__text">
            <span className="tm-wk__kind"><span className="tm-wk__num">{n}</span> {pin.kind === 'hotel' && pin.tier ? s.filters.tier[pin.tier] : s.pin[pin.kind]}{myHotel?.id === pin.id ? ` · ${s.saved.cmpMine}` : ''}</span>
            <span className="tm-wk__name">{t(pin.name, locale)}</span>
            <span className="tm-wk__why">{t(pin.why, locale)}</span>
            {whenLine(pin, locale) && <span className="tm-wk__when">{whenLine(pin, locale)}</span>}
            {pin.price && <span className="tm-wk__meta">{s.guide.priceFrom(thb(pin.price.from, locale))}{pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : ''}</span>}
            {pin.price && stay && <span className="tm-wk__meta tm-wk__stay">{s.guide.stayTotal(thb(pin.price.from * nights(stay) * roomsOf(stay), locale), nights(stay), roomsOf(stay))}</span>}
            {pin.walk && walkStation && <span className="tm-wk__meta">{s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}</span>}
            {pin.kind !== 'hotel' && myHotel && <span className="tm-wk__meta tm-wk__from">{s.weekendPage.fromHotel(fromHotel(pin)!, t(myHotel.name, locale))}</span>}
            {pin.kind !== 'hotel' && myHotel && fromHotel(pin)! > 20 && byTrain(pin) && <span className="tm-wk__meta tm-wk__train">{s.weekendPage.byTrain(byTrain(pin)!)}</span>}
            {pin.kind !== 'hotel' && byTrainElsewhere(pin) && <span className="tm-wk__meta tm-wk__from" title={byTrainElsewhere(pin)!.long}>{byTrainElsewhere(pin)!.short}</span>}
            {pin.kind === 'hotel' && <span className="tm-wk__meta">{s.saved.cmpPlaces(nearbyCount(pin))}</span>}
          </span>
        </button>
        <div className="tm-wk__links">
          <a href={pin.kind !== 'hotel' && myHotel ? directionsUrl(pin.location.lat, pin.location.lon, { from: myHotel.location, mode: fromHotel(pin)! > 20 && byTrain(pin) ? 'transit' : 'walking' }) : pin.kind !== 'hotel' && byTrainElsewhere(pin) ? directionsUrl(pin.location.lat, pin.location.lon, { from: elsewhere!.hotel.location, mode: 'transit' }) : directionsUrl(pin.location.lat, pin.location.lon)} target="_blank" rel="noopener" className="tm-card__link tm-card__link--quiet">{pin.kind !== 'hotel' && myHotel ? s.trip.directionsFrom(t(myHotel.name, locale)) : pin.kind !== 'hotel' && byTrainElsewhere(pin) ? s.trip.directionsFrom(t(elsewhere!.hotel.name, locale)) : s.card.directions}</a>
          {pin.kind === 'hotel' && <Link href={`/${locale}/${cityId}#near=${pin.id}`} className="tm-card__link tm-card__link--quiet">{s.saved.walkFromHere}</Link>}
          {pin.kind === 'hotel' && !sentHotel && myHotel && myHotel.id !== pin.id && saved.includes(pin.id) && (
            <button type="button" className="tm-card__link tm-card__link--quiet" onClick={() => chooseHotel(area.id, pin.id)}>{s.weekendPage.useHotel}</button>
          )}
          {pin.kind !== 'hotel' && (
            <button type="button" className="tm-card__link tm-card__link--quiet" onClick={() => skipStop(pin.id)}>{s.weekendPage.skipStop}</button>
          )}
          {pin.kind === 'hotel' && (Object.keys(pin.links) as Partner[]).map((p) => {
              const subId = subIdFor(`${cityId}-${area.id}`, pin.id)
              return (
                <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subId, stay)} onClick={() => p !== 'official' && trackOutbound(p, subId)} target="_blank" rel={p === 'official' ? 'noopener' : 'noopener sponsored'} className={p === 'official' ? 'tm-card__link tm-card__link--quiet' : 'tm-card__link'}>
                  {p === 'official' ? s.card.official : s.card.open(p.charAt(0).toUpperCase() + p.slice(1))}
                </a>
              )
            })}
        </div>
        {pin.kind === 'hotel' && pin.walk && airport[pin.walk.station] && <FromAirport locale={locale} routes={airport[pin.walk.station]} walkMinutes={pin.walk.minutes} />}
      </li>
    )
  }

  // On a phone the map is a sticky band above the text: a tapped stop brings it back into view.
  const showMap = () => {
    if (window.innerWidth > 1023) return
    const stage = document.querySelector('.tm-stage')
    if (stage) window.scrollTo({ top: window.scrollY + stage.getBoundingClientRect().top, behavior: 'smooth' })
  }

  const others = areas.filter((a) => a.id !== area.id)
  // Trips that fit inside one weekend day, plus, with dates set, the multi-day trips that fit inside the stay (a two-day trip in a Fri to Sun stay).
  // A road trip's default days inside the stay: the latest start that is back by check-out.
  const tripDates = (days: number): string => {
    const from = tripStartDefault(stay!, days)
    return formatDayRange(from, addDays(from, days - 1), locale)
  }
  // Plan trips first, then the rest in content order.
  const dayTrips = [...routes.filter((r) => r.duration !== 'multi-day'), ...routes.filter((r) => r.duration === 'multi-day' && stay && r.days >= 2 && r.days <= nights(stay) + 1)].sort((a, b) => Number(planTrips.includes(b.id)) - Number(planTrips.includes(a.id)))
  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-stage tm-wk" style={{ ['--pin' as string]: `var(--${area.color})` }}>
        <div className="tm-sheet tm-wk__sheet">
          <p className="tm-wk__eyebrow">{s.weekendPage.eyebrow}{stay && <span className="tm-wk__date">{s.home.inDays(daysUntil(stay))}</span>}</p>
          <h1 className="tm-h2">{s.weekendPage.title(t(area.name, locale))}</h1>
          <p className="tm-wk__lead">{t(area.tagline, locale)} {price ? s.weekendPage.budget(thb(price.min, locale), thb(price.max, locale)) : s.weekendPage.anyBudget}</p>
          {stay && seasonOf(cityId, stay.checkIn) && <p className="tm-wk__season" title={s.weekendPage.seasonNote}>{s.weekendPage.season[seasonOf(cityId, stay.checkIn)!]}</p>}
          {stay && (
            // Paper only: the dates row and booking bar are screen controls, so the printout states the stay in one line.
            <p className="tm-wk__paper">{[formatDayRange(stay.checkIn, stay.checkOut, locale), s.stay.nights(nights(stay)), s.stay.adults(adultsOf(stay), roomsOf(stay), childrenOf(stay)), myHotel ? s.weekendPage.paperHotel(t(myHotel.name, locale)) : null].filter(Boolean).join(' · ')}</p>
          )}
          {sentHotel && myHotel && myHotel.id === sentHotel && !saved.includes(myHotel.id) && (
            // A link that names a hotel (sent by someone, or the reader's own tap on "Plan it"): say so and offer to keep the hotel. Once kept, nothing: the plan is simply theirs.
            <p className="tm-wk__shared">
              {s.weekendPage.sharedWithYou(t(myHotel.name, locale), stay ? new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'short' }).formatRange(new Date(`${stay.checkIn}T12:00:00`), new Date(`${stay.checkOut}T12:00:00`)) : null)}{' '}
              <button type="button" className="tm-link tm-link--under" onClick={() => addSaved([myHotel.id])}>{s.weekendPage.saveSentHotel}</button>
            </p>
          )}
          {elsewhere && <HotelElsewhere locale={locale} area={area} elsewhere={elsewhere} />}
          <StayPicker locale={locale} />
          <div className="tm-wk__actions">
            <button type="button" onClick={share} className="tm-button">
              <Share2 aria-hidden="true" className="size-4" />
              {shared === 'copied' ? s.weekendPage.copied : shared === 'failed' ? s.weekendPage.copyFailed : s.weekendPage.share}
            </button>
            {slotDay('fridayNight') && (
              <button type="button" onClick={addToCalendar} className="tm-link tm-link--button">
                <CalendarPlus aria-hidden="true" className="size-4" />
                {s.weekendPage.calendar}
              </button>
            )}
            {nowSlot && <a href={`#tm-slot-${nowSlot}`} className="tm-link tm-link--under">{s.weekendPage.jumpToNow}</a>}
            <button type="button" onClick={() => window.print()} className="tm-link tm-link--button">
              <Printer aria-hidden="true" className="size-4" />
              {s.weekendPage.print}
            </button>
            <Link href={explorerHref} className="tm-link">{s.weekendPage.openMap}</Link>
            <Link href={`/${locale}/${cityId}/area/${area.id}`} className="tm-link">{s.areaPage.link}</Link>
          </div>
          {skippedHere.length > 0 && (
            <p className="tm-wk__empty tm-wk__skipped">
              {s.weekendPage.skipped(skippedHere.map((p) => t(p.name, locale)).join(', '))} <button type="button" className="tm-link tm-link--under" onClick={() => { unskipStops(skippedHere.map((p) => p.id)); setSentSkips([]) }}>{s.weekendPage.putBack}</button>
            </p>
          )}
          <ol className="tm-wk__slots">
            {WEEKEND_SLOTS.map((slot) => (
              <li key={slot} className={`tm-wk__slot${nowSlot === slot ? ' tm-wk__slot--now' : ''}`} id={`tm-slot-${slot}`}>
                <h2 className="tm-wk__time">{s.guide.slots[slot]}{slotDate(slot) && <span className="tm-wk__date"> · {slotDate(slot)}</span>}{nowSlot === slot && <span className="tm-wk__now">{s.weekendPage.now}</span>}{isCheckOutDay(slot) && <span className="tm-wk__now tm-wk__checkout" title={s.weekendPage.checkOutDayNote}>{s.weekendPage.checkOutDay}</span>}</h2>
                {plan.slots[slot].length === 0 ? (
                  <>
                    <p className="tm-wk__empty">
                      {s.guide.slotEmpty}{' · '}
                      <Link href={`/${locale}/${cityId}#area=${area.id}&time=${SLOT_TIMES[slot].join(',')}`} className="tm-link tm-link--under">{s.weekendPage.slotEmptyLink}</Link>
                    </p>
                    {borrowed[slot] && (
                      <div className="tm-wk__borrowed" style={{ '--pin': `var(--${borrowed[slot].area.color})` } as CSSProperties}>
                        <p className="tm-wk__empty tm-wk__borrowed-lead">{s.weekendPage.borrowed(t(borrowed[slot].area.name, locale))}</p>
                        <ul className="tm-wk__borrowed-list">
                          {borrowed[slot].pins.map((pin) => (
                            <li key={pin.id}>
                              <Link href={`/${locale}/${cityId}#area=${borrowed[slot]!.area.id}&pin=${pin.id}`} className="tm-wk__borrowed-name">{t(pin.name, locale)}</Link>
                              <span className="tm-wk__why">{t(pin.why, locale)}</span>
                              {whenLine(pin, locale) && <span className="tm-wk__meta tm-wk__when">{whenLine(pin, locale)}</span>}
                              {pin.walk && stationById.get(pin.walk.station) && <span className="tm-wk__meta">{s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${stationById.get(pin.walk.station)!.code ? stationById.get(pin.walk.station)!.code + ' ' : ''}${t(stationById.get(pin.walk.station)!.name, locale)}`)}</span>}
                              {myHotel && byTrain(pin) && <span className="tm-wk__meta tm-wk__train">{s.weekendPage.byTrainFrom(t(myHotel.name, locale), byTrain(pin)!)}</span>}
                              {byTrainElsewhere(pin) && <span className="tm-wk__meta tm-wk__train" title={byTrainElsewhere(pin)!.long}>{byTrainElsewhere(pin)!.short}</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <ul className="tm-wk__stops">
                      {plan.slots[slot].map((pin, i, arr) => (
                        <Fragment key={pin.id}>
                          {/* The leg between two stops of one slot: a walking estimate, straight line, so the plan reads as a route and not a list. */}
                          {i > 0 && (() => {
                            const prev = arr[i - 1]
                            const walk = Math.max(1, Math.round(distanceM(prev.location.lon, prev.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN))
                            // Over 25 minutes on foot, and both stops at different stations: the ride between them, when the lines connect.
                            const legs = walk > 25 && prev.walk && pin.walk && prev.walk.station !== pin.walk.station ? stopRides[prev.walk.station]?.[pin.walk.station] : null
                            return <li className="tm-wk__leg" title={s.stationPage.estimated}>{s.weekendPage.legWalk(walk, t(prev.name, locale))}{legs && legs.length > 0 && <span className="tm-wk__leg-train">{s.weekendPage.legTrain(rideShort(legs, pin.walk!.minutes, locale))}</span>}</li>
                          })()}
                          {stop(pin)}
                        </Fragment>
                      ))}
                    </ul>
                    {/* Two stops or more: the slot as one walking route in Google Maps, from the saved hotel when there is one. */}
                    {plan.slots[slot].length >= 2 && (() => {
                      const href = dayDirectionsUrl([...(myHotel ? [myHotel.location] : []), ...plan.slots[slot].map((p) => p.location)], 'walking')
                      return href ? <p className="tm-wk__route"><a href={href} target="_blank" rel="noopener" className="tm-link tm-link--under">{myHotel ? s.weekendPage.openSlotFrom(t(myHotel.name, locale)) : s.weekendPage.openSlot}</a></p> : null
                    })()}
                    {/* The night ends at the hotel: the way back from the slot's last stop, by train when it is a real ride. */}
                    {myHotel && (slot === 'fridayNight' || slot === 'saturdayNight') && (() => {
                      const last = plan.slots[slot][plan.slots[slot].length - 1]
                      return <p className="tm-wk__back"><a href={directionsUrl(myHotel.location.lat, myHotel.location.lon, { from: last.location, mode: fromHotel(last)! > 20 && byTrain(last) ? 'transit' : 'walking' })} target="_blank" rel="noopener" className="tm-link tm-link--under">{s.trip.endAtHotel(t(myHotel.name, locale))}</a></p>
                    })()}
                  </>
                )}
              </li>
            ))}
            <li className="tm-wk__slot tm-wk__slot--stay" id="tm-stay">
              <h2 className="tm-wk__time">{s.guide.stay}</h2>
              {hotels.length > 0 && <p className={myHotel ? 'tm-wk__empty' : 'tm-wk__empty tm-wk__hint'}>{myHotel ? s.weekendPage.hotelPicked(t(myHotel.name, locale)) : s.weekendPage.pickHotelHint}{myHotel && hotels.filter((h) => saved.includes(h.id)).length > 1 ? ` ${s.weekendPage.switchHint}` : ''}</p>}
              {hotels.length === 0 ? (
                <p className="tm-wk__empty">
                  {s.guide.stayNone}
                  {price && area.pins.some((p) => p.kind === 'hotel') && (
                    <>
                      {' '}
                      <button type="button" className="tm-link tm-link--under" onClick={() => { setPrice(null); window.history.replaceState(null, '', window.location.pathname + window.location.hash) }}>{s.weekendPage.showAllHotels}</button>
                    </>
                  )}
                </p>
              ) : <ul className="tm-wk__stops">{hotels.map(stop)}</ul>}
              {hotels.length > 1 && (
                <div className="tm-ar__cmp">
                  <h3 className="tm-wk__time">{s.areaPage.compare}</h3>
                  <p className="tm-saved__note">{s.weekendPage.compareLead}</p>
                  <HotelCompare locale={locale} cityId={cityId} entries={hotels.map((pin) => ({ pin, area }))} stations={stations} nearbyCount={nearbyCount} showArea={false} mine={myHotel?.id} airport={airport} />
                </div>
              )}
            </li>
          </ol>
          {dayTrips.length > 0 && (
            <section className="tm-wk__others">
              <h2 className="tm-wk__time">{s.weekendPage.dayOut}</h2>
              <p className="tm-wk__empty">{stay && dayTrips.some((r) => r.duration === 'multi-day') ? s.weekendPage.dayOutLeadStay(nights(stay)) : s.weekendPage.dayOutLead}</p>
              <ul className="tm-wk__stops">
                {dayTrips.map((r) => (
                  <li key={r.id}>
                    <Link href={`/${locale}/${cityId}/trip/${r.id}`} className="tm-wk__stop tm-wk__trip">
                      <span className="tm-wk__text">
                        <span className="tm-wk__kind">{r.duration === 'multi-day' ? s.trip.days(r.days) : s.trip.duration[r.duration]} · {s.trip.mode[r.mode]}{r.distanceKm !== undefined ? ` · ${s.trip.km(r.distanceKm)}` : ''}{sentTrips.includes(r.id) ? ` · ${s.weekendPage.inPlan}` : keptTrips.includes(r.id) ? ` · ${s.trip.kept}` : ''}</span>
                        <span className="tm-wk__name">{t(r.name, locale)}</span>
                        <span className="tm-wk__why">{t(r.tagline, locale)}</span>
                        {r.duration === 'multi-day' && stay && <span className="tm-wk__meta tm-wk__from">{s.trip.fitsStay(nights(stay))} · {tripDates(r.days)}</span>}
                        {r.duration !== 'multi-day' && stay && dayTripOptions(stay, r.duration).length > 0 && <span className="tm-wk__meta tm-wk__from">{s.trip.fitsDay(dayTripOptions(stay, r.duration).slice(0, 3).map((d) => formatDay(d, locale)).join(` ${s.trip.or} `))}</span>}
                        {tripByTrain(r.id) && <span className="tm-wk__meta tm-wk__from">{tripByTrain(r.id)}</span>}
                      </span>
                    </Link>
                    <div className="tm-wk__links">
                      <button type="button" aria-pressed={keptTrips.includes(r.id)} className="tm-card__link tm-card__link--quiet" onClick={() => toggleKeptTrip(r.id)}>{keptTrips.includes(r.id) ? s.trip.kept : s.trip.keep}</button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="tm-wk__others tm-wk__others--chips">
            <h2 className="tm-wk__time">{s.weekendPage.others}</h2>
            <ul className="tm-wk__other-list">
              {others.map((a) => (
                <li key={a.id}>
                  <Link href={`/${locale}/${cityId}/weekend/${a.id}${priceQuery ? `?${priceQuery}` : ''}`} className="tm-weekend__stop" style={{ ['--pin' as string]: `var(--${a.color})` }}>
                    <span aria-hidden="true" className="tm-wk__dot" />
                    {t(a.name, locale)}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
          <SiteFooter locale={locale} cityId={cityId} compact />
        </div>
        <div className="tm-stage__map" data-ui>
          {detected3D !== null && (
            <StageMap locale={locale} camera={area.camera} threeD={detected3D} areas={mapAreas} route={null} focus={focus} card={card} onCloseCard={() => setCard(null)} hoverPin={hoverId} onHoverPin={setHoverId} onSelectPin={(pin) => { setCard({ pin, area }) }} cityId={cityId} stations={stations} />
          )}
          <div className="tm-stage__bar tm-stage__bar--page" data-map-overlay="bottom">
            <span className="tm-stage__showing">{s.home.showing(t(area.name, locale))}</span>
            {slotDay('fridayNight') && (
              <button type="button" onClick={addToCalendar} className="tm-link tm-link--button">
                <CalendarPlus aria-hidden="true" className="size-4" />
                {s.weekendPage.calendar}
              </button>
            )}
            <Link href={explorerHref} className="tm-link">{s.weekendPage.openMap}</Link>
          </div>
        </div>
      </main>
      {myHotel && (
        // Phones: the hotel's booking links (hearted, or the one a sent link names) stay within reach at the bottom while the plan scrolls.
        <aside className="tm-wk__book" data-ui aria-label={s.weekendPage.bookBarLabel}>
          <span className="tm-wk__book-text">
            <span className="tm-wk__book-name">{t(myHotel.name, locale)}</span>
            {myHotel.price && stay && <span className="tm-wk__book-total" title={myHotel.price.basis === 'tier-estimate' ? s.guide.priceEstimate : undefined}>{s.guide.stayTotal(thb(myHotel.price.from * nights(stay) * roomsOf(stay), locale), nights(stay), roomsOf(stay))}{myHotel.price.basis === 'tier-estimate' ? '*' : ''}</span>}
          </span>
          {(Object.keys(myHotel.links) as Partner[]).filter((p) => p !== 'official').map((p) => {
            const subId = subIdFor(`${cityId}-${area.id}`, myHotel.id)
            return (
              <a key={p} href={buildOutboundUrl(p, myHotel.links[p]!, subId, stay)} onClick={() => trackOutbound(p, subId)} target="_blank" rel="noopener sponsored" className="tm-card__link">{p.charAt(0).toUpperCase() + p.slice(1)}</a>
            )
          })}
        </aside>
      )}
    </>
  )
}
