'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { CalendarPlus, Printer, Share2, X } from 'lucide-react'
import type { Area, Locale, Pin, Station, TripRoute } from '@/lib/content/types'
import { FromAirport, rideSentence } from '@/components/stay/from-airport'
import { railLegs, type AirportRoutes } from '@/lib/transit/from-airport'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { directionsUrl } from '@/lib/links/directions'
import { formatDayRange } from '@/lib/stay/format'
import { adoptStayFromUrl, adultsOf, childrenOf, nights, roomsOf, stayParam, useStay } from '@/lib/stay/store'
import { StayPicker } from '@/components/stay/stay-picker'
import { HotelCompare } from '@/components/stay/hotel-compare'
import { trackOutbound } from '@/lib/links/track'
import { thb } from '@/lib/explorer/price'
import { distanceM, WALK_PACE_M_PER_MIN } from '@/lib/explorer/filters'
import { whenLine } from '@/lib/explorer/when'
import { addSaved, clearSaved, toggleSaved, useSaved } from '@/lib/saved/store'
import { addKeptTrips, clearKeptTrips, toggleKeptTrip, useKeptTrips } from '@/lib/saved/trips'
import { formatDay } from '@/lib/stay/format'
import { addDays, dayTripOptions } from '@/lib/stay/store'
import { addTripStartPicks, awayNights, hereStay, parseStarts, startsParam, tripClashes, tripDayOptions, tripStartFor, useTripStartPicks } from '@/lib/stay/trip-start'
import { buildIcs, downloadIcs, TRIP_HOURS, type CalendarEvent } from '@/lib/stay/calendar'
import { chooseHotel, myHotelAcross, myHotelChoice, useHotelChoiceVersion } from '@/lib/saved/my-hotel'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'
import { KIND_ICONS } from '@/components/explorer/kind-bar'

export interface SavedEntry {
  pin: Pin
  area: Pick<Area, 'id' | 'name' | 'color'>
}

/**
 * The shortlist. Shows this browser's saved hotels, or the hotels named in
 * "?ids=a,b,c" when the address came from someone else's "Send this list".
 */
/** A trip as its saved-list row shows it. */
/** A route slimmed for the saved page; `nightsAway` is the trip days (1-based) that sleep on the road. */
export type SavedTrip = Pick<TripRoute, 'id' | 'name' | 'tagline' | 'mode' | 'duration' | 'days' | 'distanceKm'> & { nightsAway: number[] }

export function SavedPage({ locale, cityId, entries, trips = [], stations, interchanges = [], airport = {} }: { locale: Locale; cityId: string; entries: SavedEntry[]; trips?: SavedTrip[]; stations: Station[]; interchanges?: [string, string][]; airport?: Record<string, AirportRoutes> }) {
  const s = strings(locale)
  const stay = useStay()
  const mine = useSaved()
  const [sentIds, setSentIds] = useState<string[] | null>(null)
  // Trips on a sent list ("?trips="): shown with it, kept only on "Keep these".
  const [sentTrips, setSentTrips] = useState<string[]>([])
  const [sentStarts, setSentStarts] = useState<Readonly<Record<string, string>>>({})
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed' | 'kept'>('idle')
  const byId = useMemo(() => new Map(entries.map((e) => [e.pin.id, e])), [entries])
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])

  // The address is read once the page is live, in a frame callback (the static page cannot know it).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const ids = new URLSearchParams(window.location.search).get('ids')
      setSentIds(ids ? ids.split(',').filter((id) => id) : null)
      setSentTrips((new URLSearchParams(window.location.search).get('trips') ?? '').split(',').filter(Boolean))
      setSentStarts(parseStarts(new URLSearchParams(window.location.search).get('starts')))
      adoptStayFromUrl()
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  const ids = sentIds ?? mine
  // Places (not hotels) inside a ten-minute walk of a hotel, straight-line at walking pace.
  const nearbyCount = (hotel: Pin) => entries.filter((e) => e.pin.kind !== 'hotel' && distanceM(hotel.location.lon, hotel.location.lat, e.pin.location.lon, e.pin.location.lat) <= WALK_PACE_M_PER_MIN * 10).length
  const rows = ids.map((id) => byId.get(id)).filter((e): e is SavedEntry => !!e)
  const keptIds = useKeptTrips()
  const ownPicks = useTripStartPicks()
  // A sent list shows its trips on the sender's days (starts=); the reader's own list on their own picks.
  const picks = sentIds ? sentStarts : ownPicks
  const keptTrips = (sentIds ? sentTrips : keptIds).map((id) => trips.find((r) => r.id === id)).filter((r): r is SavedTrip => !!r)
  // A clashing trip with more than one day to choose from links to its start chips.
  const canMove = (r: SavedTrip): boolean => !!stay && clashes(r).length > 0 && tripDayOptions(stay, r).length > 1
  // Two kept trips in the same hours on the same day (each on its picked or default day).
  const clashes = (r: SavedTrip): SavedTrip[] => (stay ? tripClashes(stay, r, keptTrips, picks) : [])
  // With dates set, the days of the stay a trip fits, as the trips index says it.
  const tripFit = (r: SavedTrip): string | null => {
    if (!stay) return null
    if (r.days < 2) {
      if (picks[r.id] && dayTripOptions(stay, r.duration).includes(picks[r.id])) return s.trip.onDay(formatDay(picks[r.id], locale))
      const days = dayTripOptions(stay, r.duration).slice(0, 3).map((d) => formatDay(d, locale))
      return days.length > 0 ? s.trip.fitsDay(days.join(` ${s.trip.or} `)) : null
    }
    if (r.days > nights(stay) + 1) return s.trip.tooLong(nights(stay))
    const from = tripStartFor(stay, r, picks)!
    return `${s.trip.fitsStay(nights(stay))} · ${formatDayRange(from, addDays(from, r.days - 1), locale)}`
  }
  // Nights the kept road trips sleep away: hotel totals here count the other nights only.
  const away = stay ? awayNights(stay, keptTrips.map((r) => ({ ...r, stops: r.nightsAway.map((day) => ({ kind: 'hotel' as const, day })) })), keptTrips.map((r) => r.id), picks) : []
  const hereNights = stay ? nights(stay) - away.length : 0
  const bookStay = stay ? hereStay(stay, away) : null
  const missing = ids.length - rows.length
  const hotelRows = rows.filter((e) => e.pin.kind === 'hotel')
  const placeRows = rows.filter((e) => e.pin.kind !== 'hotel')
  // In an area with two or more saved hotels, one is the pick the plan pages walk from (the chosen one, else the first saved); only on the reader's own list.
  const choiceVersion = useHotelChoiceVersion()
  const pickFor = useMemo(() => {
    const byArea = new Map<string, string>()
    for (const e of hotelRows) {
      if (byArea.has(e.area.id)) continue
      const chosen = myHotelChoice(e.area.id)
      byArea.set(e.area.id, hotelRows.find((h) => h.area.id === e.area.id && h.pin.id === chosen)?.pin.id ?? e.pin.id)
    }
    return (areaId: string) => byArea.get(areaId)
    // choiceVersion is read so a new choice recomputes the picks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelRows, choiceVersion])
  const areaHotelCount = (areaId: string) => hotelRows.filter((h) => h.area.id === areaId).length
  // Hotels saved in two or more areas: the one the city-wide pages sleep in gets a tag, the others a button to take over.
  const cityPick = useMemo(() => {
    const byArea: Record<string, { id: string }[]> = {}
    for (const e of hotelRows) (byArea[e.area.id] ??= []).push({ id: e.pin.id })
    return Object.keys(byArea).length > 1 ? myHotelAcross(byArea, mine) : null
    // choiceVersion is read so a new choice recomputes the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelRows, mine, choiceVersion])
  // The hotel a saved place measures its walk from: the area's pick (one saved hotel is its own pick).
  const hotelFor = (areaId: string) => hotelRows.find((h) => h.area.id === areaId && h.pin.id === pickFor(areaId))
  // The hotel the whole weekend sleeps in (the city-wide pick, or the only one), for places saved in other areas: reached by train, not on foot.
  const homeHotel = useMemo(() => {
    const byArea: Record<string, { id: string }[]> = {}
    for (const e of hotelRows) (byArea[e.area.id] ??= []).push({ id: e.pin.id })
    const pick = myHotelAcross(byArea, sentIds ?? mine)
    return pick ? hotelRows.find((h) => h.pin.id === pick.hotel.id) ?? null : null
    // choiceVersion is read so a new choice recomputes the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hotelRows, mine, sentIds, choiceVersion])
  const byTrain = (pin: Pin, areaId: string): string | null => {
    if (hotelFor(areaId) || !homeHotel?.pin.walk || !pin.walk) return null
    const legs = railLegs(stations, interchanges, homeHotel.pin.walk.station, pin.walk.station)
    return legs && legs.length > 0 ? s.weekendPage.byTrainFrom(t(homeHotel.pin.name, locale), rideSentence(legs, pin.walk.minutes, locale)) : null
  }

  const share = async () => {
    const url = `${window.location.origin}/${locale}/saved?ids=${encodeURIComponent(ids.join(','))}${stay ? `&stay=${stayParam(stay)}` : ''}${keptTrips.length > 0 ? `&trips=${encodeURIComponent(keptTrips.map((r) => r.id).join(','))}` : ''}${startsParam(keptTrips.map((r) => r.id), picks) ? `&starts=${encodeURIComponent(startsParam(keptTrips.map((r) => r.id), picks)!)}` : ''}`
    const text = s.saved.shareText(hotelRows.length, placeRows.length, hotelRows[0] ? t(hotelRows[0].pin.name, locale) : null) + (keptTrips.length > 0 ? s.saved.shareTrips(keptTrips.length) : '')
    try {
      if (navigator.share) {
        await navigator.share({ title: s.saved.title, text, url })
        return
      }
      await navigator.clipboard.writeText(url)
      setShared('copied')
    } catch {
      setShared('failed')
    }
    window.setTimeout(() => setShared('idle'), 2500)
  }

  // One calendar event per trip day, on the days the list places them (the trip page has the stop-by-stop file).
  const tripEvents = (): CalendarEvent[] => {
    if (!stay) return []
    return keptTrips.flatMap((r) => {
      const from = tripStartFor(stay, r, picks)
      if (!from) return []
      const url = `${window.location.origin}/${locale}/${cityId}/trip/${r.id}${startsParam([r.id], picks) ? `?start=${picks[r.id]}` : ''}`
      return Array.from({ length: r.days }, (_, i) => ({
        date: addDays(from, i), start: TRIP_HOURS[r.duration][0], end: TRIP_HOURS[r.duration][1],
        title: s.trip.calendarDay(t(r.name, locale), i + 1, r.days),
        description: [t(r.tagline, locale), url].join('\n'),
        url,
      }))
    })
  }
  const canCalendar = !!stay && keptTrips.some((r) => tripStartFor(stay, r, picks))
  const addToCalendar = () => downloadIcs('trips.ics', buildIcs(tripEvents(), s.saved.calendarName))

  const keep = () => {
    addSaved(rows.map((e) => e.pin.id))
    addKeptTrips(keptTrips.map((r) => r.id))
    // The sender's days come along, so the trips sit where they did in the sent list.
    addTripStartPicks(Object.fromEntries(keptTrips.filter((r) => sentStarts[r.id]).map((r) => [r.id, sentStarts[r.id]])))
    setShared('kept')
    window.setTimeout(() => setShared('idle'), 2500)
  }

  const row = ({ pin, area }: SavedEntry) => {
        const photo = pin.photos?.[0] ?? pin.photo
        const KindIcon = KIND_ICONS[pin.kind]
        const walkStation = pin.walk ? stationById.get(pin.walk.station) : undefined
        const partners = Object.keys(pin.links) as Partner[]
        return (
          <li key={pin.id} className="tm-wk__item">
            {!sentIds && (
              <button type="button" onClick={() => toggleSaved(pin.id)} aria-label={s.saved.remove} title={s.saved.remove} className="tm-save tm-wk__save">
                <X aria-hidden="true" className="size-4" />
              </button>
            )}
            <Link href={`/${locale}/${cityId}#pin=${pin.id}`} className="tm-wk__stop" style={{ ['--pin' as string]: `var(--${area.color})` }}>
              {photo ? (
                <Image src={photo.src} alt="" width={72} height={72} sizes="72px" className="tm-wk__thumb" />
              ) : (
                <span aria-hidden="true" className="tm-wk__thumb tm-wk__thumb--empty"><KindIcon className="size-6" /></span>
              )}
              <span className="tm-wk__text">
                <span className="tm-wk__kind">{pin.kind === 'hotel' && pin.tier ? s.filters.tier[pin.tier] : s.pin[pin.kind]} · {t(area.name, locale)}</span>
                <span className="tm-wk__name">{t(pin.name, locale)}</span>
                <span className="tm-wk__why">{t(pin.why, locale)}</span>
                {whenLine(pin, locale) && <span className="tm-wk__when">{whenLine(pin, locale)}</span>}
                {pin.price && <span className="tm-wk__meta">{s.guide.priceFrom(thb(pin.price.from, locale))}{pin.price.basis === 'tier-estimate' ? ` (${s.guide.priceEstimate})` : ''}</span>}
            {pin.price && stay && hereNights > 0 && <span className="tm-wk__meta tm-wk__stay">{s.guide.stayTotal(thb(pin.price.from * hereNights * roomsOf(stay), locale), hereNights, roomsOf(stay))}{away.length > 0 ? s.guide.stayTotalAway(away.length) : ''}</span>}
                {pin.walk && walkStation && <span className="tm-wk__meta">{s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}</span>}
                {pin.kind === 'hotel' && !sentIds && areaHotelCount(area.id) > 1 && pickFor(area.id) === pin.id && <span className="tm-wk__meta tm-wk__from">{s.saved.yourPick(t(area.name, locale))}</span>}
                {pin.kind !== 'hotel' && byTrain(pin, area.id) && <span className="tm-wk__meta tm-wk__from">{byTrain(pin, area.id)}</span>}
                {pin.kind !== 'hotel' && hotelFor(area.id) && <span className="tm-wk__meta tm-wk__from">{s.weekendPage.fromHotel(Math.max(1, Math.round(distanceM(hotelFor(area.id)!.pin.location.lon, hotelFor(area.id)!.pin.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN)), t(hotelFor(area.id)!.pin.name, locale))}</span>}
                <span className="tm-wk__meta tm-saved__map">{s.saved.showOnMap}</span>
              </span>
            </Link>
            <div className="tm-wk__links">
              <a href={pin.kind !== 'hotel' && hotelFor(area.id) ? directionsUrl(pin.location.lat, pin.location.lon, { from: hotelFor(area.id)!.pin.location }) : pin.kind !== 'hotel' && byTrain(pin, area.id) ? directionsUrl(pin.location.lat, pin.location.lon, { from: homeHotel!.pin.location, mode: 'transit' }) : directionsUrl(pin.location.lat, pin.location.lon)} target="_blank" rel="noopener" className="tm-card__link tm-card__link--quiet">{pin.kind !== 'hotel' && hotelFor(area.id) ? s.trip.directionsFrom(t(hotelFor(area.id)!.pin.name, locale)) : pin.kind !== 'hotel' && byTrain(pin, area.id) ? s.trip.directionsFrom(t(homeHotel!.pin.name, locale)) : s.card.directions}</a>
              {pin.kind === 'hotel' && <Link href={`/${locale}/${cityId}#near=${pin.id}`} className="tm-card__link tm-card__link--quiet">{s.saved.walkFromHere}</Link>}
              {pin.kind === 'hotel' && !sentIds && areaHotelCount(area.id) > 1 && pickFor(area.id) !== pin.id && (
                <button type="button" className="tm-card__link tm-card__link--quiet" onClick={() => chooseHotel(area.id, pin.id)}>{s.weekendPage.useHotel}</button>
              )}
              {pin.kind === 'hotel' && !sentIds && cityPick && cityPick.hotel.id !== pin.id && pickFor(area.id) === pin.id && (
                <button type="button" className="tm-card__link tm-card__link--quiet" onClick={() => chooseHotel(area.id, pin.id)}>{s.saved.sleepHere}</button>
              )}
              {pin.kind === 'hotel' && cityPick && cityPick.hotel.id === pin.id && <span className="tm-card__link tm-card__link--quiet tm-wk__shared-done">{s.saved.weekendHotel}</span>}
                {partners.map((p) => {
                  const subId = subIdFor(`${cityId}-${area.id}`, pin.id)
                  return (
                    <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subId, bookStay)} onClick={() => p !== 'official' && trackOutbound(p, subId)} target="_blank" rel={p === 'official' ? 'noopener' : 'noopener sponsored'} className={p === 'official' ? 'tm-card__link tm-card__link--quiet' : 'tm-card__link'}>
                      {p === 'official' ? s.card.official : s.card.open(p.charAt(0).toUpperCase() + p.slice(1))}
                    </a>
                  )
                })}
            </div>
            {pin.kind === 'hotel' && pin.walk && airport[pin.walk.station] && <FromAirport locale={locale} routes={airport[pin.walk.station]} walkMinutes={pin.walk.minutes} />}
          </li>
        )
  }

  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-credits tm-saved">
        <h1 className="tm-h2">{s.saved.title}</h1>
        <p className="tm-wk__lead">{sentIds ? s.saved.sent(rows.length) : rows.length + keptTrips.length > 0 ? s.saved.lead(rows.length + keptTrips.length) : s.saved.empty}</p>
        {stay && rows.length > 0 && <p className="tm-wk__paper">{[formatDayRange(stay.checkIn, stay.checkOut, locale), s.stay.nights(nights(stay)), s.stay.adults(adultsOf(stay), roomsOf(stay), childrenOf(stay))].join(' · ')}</p>}
        <div className="tm-wk__actions">
          {rows.length > 0 && !sentIds && (
            <button type="button" onClick={share} className="tm-button tm-button--small">
              <Share2 aria-hidden="true" className="size-4" />
              {shared === 'copied' ? s.saved.copied : shared === 'failed' ? s.saved.copyFailed : s.saved.share}
            </button>
          )}
          {canCalendar && (
            <button type="button" onClick={addToCalendar} className="tm-link tm-link--button">
              <CalendarPlus aria-hidden="true" className="size-4" />
              {s.saved.calendar}
            </button>
          )}
          {rows.length > 0 && (
            <button type="button" onClick={() => window.print()} className="tm-link tm-link--button">
              <Printer aria-hidden="true" className="size-4" />
              {s.saved.print}
            </button>
          )}
          {sentIds && rows.length + keptTrips.length > 0 && (
            <button type="button" onClick={keep} className="tm-button tm-button--small">{shared === 'kept' ? s.saved.kept : s.saved.keep}</button>
          )}
          {sentIds && <button type="button" onClick={() => { setSentIds(null); window.history.replaceState(null, '', window.location.pathname) }} className="tm-link">{s.saved.mine}</button>}
          {rows.length === 0 && keptTrips.length === 0 && !sentIds && (
            <>
              <Link href={`/${locale}/${cityId}`} className="tm-button tm-button--small">{s.saved.emptyLink}</Link>
              <Link href={`/${locale}#tm-quiz`} className="tm-link tm-link--under">{s.saved.emptyQuiz}</Link>
            </>
          )}
          {rows.length + keptTrips.length > 0 && !sentIds && <button type="button" onClick={() => { clearSaved(); clearKeptTrips() }} className="tm-link">{s.saved.clear}</button>}
        </div>
        {missing > 0 && <p className="tm-saved__note">{s.saved.unknown(missing)}</p>}
        {hotelRows.length > 1 && (
          <section className="tm-saved__group">
            <h2 className="tm-wk__time">{s.saved.compare}</h2>
            <p className="tm-saved__note">{sentIds ? s.saved.compareLeadSent : s.saved.compareLead}</p>
            <StayPicker locale={locale} />
            <HotelCompare locale={locale} cityId={cityId} entries={hotelRows} stations={stations} nearbyCount={nearbyCount} mine={sentIds ? null : hotelRows.find((e) => pickFor(e.area.id) === e.pin.id && areaHotelCount(e.area.id) > 1)?.pin.id} airport={airport} trips={keptTrips} plan={{ ids: keptTrips.map((r) => r.id), picks }} />
          </section>
        )}
        <div className="tm-saved__cols">
        {hotelRows.length > 0 && (
          <section className="tm-saved__group">
            <h2 className="tm-wk__time">{s.stationPage.hotels}</h2>
            {hotelRows.length < 2 && <StayPicker locale={locale} />}
            <ol className="tm-wk__stops tm-saved__list">{hotelRows.map(row)}</ol>
            {!sentIds && (
              <p className="tm-saved__plan">
                {[...new Map(hotelRows.map((e) => [e.area.id, e.area])).values()].map((a) => (
                  <Link key={a.id} href={`/${locale}/${cityId}/weekend/${a.id}`} className="tm-link tm-link--under">{s.home.quiz.plan(t(a.name, locale))}</Link>
                ))}
              </p>
            )}
          </section>
        )}
        {placeRows.length > 0 && (
          <section className="tm-saved__group">
            <h2 className="tm-wk__time">{s.stationPage.places}</h2>
            <ol className="tm-wk__stops tm-saved__list">{placeRows.map(row)}</ol>
          </section>
        )}
        </div>
        {keptTrips.length > 0 && (
          // The trips kept from the trip pages, or the ones a sent list carries.
          <section className="tm-saved__group">
            <h2 className="tm-wk__time">{s.saved.trips}</h2>
            <p className="tm-saved__note">{s.saved.tripsNote}</p>
            <ol className="tm-wk__stops tm-saved__list">
              {keptTrips.map((r) => (
                <li key={r.id}>
                  <Link href={`/${locale}/${cityId}/trip/${r.id}`} className="tm-wk__stop tm-wk__trip">
                    <span className="tm-wk__text">
                      <span className="tm-wk__kind">{r.duration === 'multi-day' ? s.trip.days(r.days) : s.trip.duration[r.duration]} · {s.trip.mode[r.mode]}{r.distanceKm !== undefined ? ` · ${s.trip.km(r.distanceKm)}` : ''}</span>
                      <span className="tm-wk__name">{t(r.name, locale)}</span>
                      <span className="tm-wk__why">{t(r.tagline, locale)}</span>
                      {tripFit(r) && <span className="tm-wk__meta tm-wk__from">{tripFit(r)}</span>}
                      {clashes(r).length > 0 && <span className="tm-wk__meta">{s.saved.sameDay(clashes(r).map((o) => t(o.name, locale)).join(', '))}</span>}
                    </span>
                  </Link>
                  {(!sentIds || canMove(r)) && (
                    <div className="tm-wk__links">
                      {canMove(r) && <Link href={`/${locale}/${cityId}/trip/${r.id}#tm-start`} className="tm-card__link">{s.saved.pickAnotherDay}</Link>}
                      {!sentIds && <button type="button" className="tm-card__link tm-card__link--quiet" onClick={() => toggleKeptTrip(r.id)}>{s.saved.forget}</button>}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}
      </main>
      <SiteFooter locale={locale} cityId={cityId} />
    </>
  )
}
