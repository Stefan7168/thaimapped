'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Printer, Share2, X } from 'lucide-react'
import type { Area, Locale, Pin, Station } from '@/lib/content/types'
import { FromAirport } from '@/components/stay/from-airport'
import type { AirportRoutes } from '@/lib/transit/from-airport'
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
export function SavedPage({ locale, cityId, entries, stations, airport = {} }: { locale: Locale; cityId: string; entries: SavedEntry[]; stations: Station[]; airport?: Record<string, AirportRoutes> }) {
  const s = strings(locale)
  const stay = useStay()
  const mine = useSaved()
  const [sentIds, setSentIds] = useState<string[] | null>(null)
  const [shared, setShared] = useState<'idle' | 'copied' | 'failed' | 'kept'>('idle')
  const byId = useMemo(() => new Map(entries.map((e) => [e.pin.id, e])), [entries])
  const stationById = useMemo(() => new Map(stations.map((st) => [st.id, st])), [stations])

  // The address is read once the page is live, in a frame callback (the static page cannot know it).
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      const ids = new URLSearchParams(window.location.search).get('ids')
      setSentIds(ids ? ids.split(',').filter((id) => id) : null)
      adoptStayFromUrl()
    })
    return () => window.cancelAnimationFrame(id)
  }, [])

  const ids = sentIds ?? mine
  // Places (not hotels) inside a ten-minute walk of a hotel, straight-line at walking pace.
  const nearbyCount = (hotel: Pin) => entries.filter((e) => e.pin.kind !== 'hotel' && distanceM(hotel.location.lon, hotel.location.lat, e.pin.location.lon, e.pin.location.lat) <= WALK_PACE_M_PER_MIN * 10).length
  const rows = ids.map((id) => byId.get(id)).filter((e): e is SavedEntry => !!e)
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

  const share = async () => {
    const url = `${window.location.origin}/${locale}/saved?ids=${encodeURIComponent(ids.join(','))}${stay ? `&stay=${stayParam(stay)}` : ''}`
    const text = s.saved.shareText(hotelRows.length, placeRows.length, hotelRows[0] ? t(hotelRows[0].pin.name, locale) : null)
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

  const keep = () => {
    addSaved(rows.map((e) => e.pin.id))
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
            {pin.price && stay && <span className="tm-wk__meta tm-wk__stay">{s.guide.stayTotal(thb(pin.price.from * nights(stay) * roomsOf(stay), locale), nights(stay), roomsOf(stay))}</span>}
                {pin.walk && walkStation && <span className="tm-wk__meta">{s.city.walkMinutes(pin.walk.minutes)} {s.city.from(`${walkStation.code ? walkStation.code + ' ' : ''}${t(walkStation.name, locale)}`)}</span>}
                {pin.kind === 'hotel' && !sentIds && areaHotelCount(area.id) > 1 && pickFor(area.id) === pin.id && <span className="tm-wk__meta tm-wk__from">{s.saved.yourPick(t(area.name, locale))}</span>}
                {pin.kind !== 'hotel' && hotelFor(area.id) && <span className="tm-wk__meta tm-wk__from">{s.weekendPage.fromHotel(Math.max(1, Math.round(distanceM(hotelFor(area.id)!.pin.location.lon, hotelFor(area.id)!.pin.location.lat, pin.location.lon, pin.location.lat) / WALK_PACE_M_PER_MIN)), t(hotelFor(area.id)!.pin.name, locale))}</span>}
                <span className="tm-wk__meta tm-saved__map">{s.saved.showOnMap}</span>
              </span>
            </Link>
            {pin.kind === 'hotel' && pin.walk && airport[pin.walk.station] && <FromAirport locale={locale} routes={airport[pin.walk.station]} walkMinutes={pin.walk.minutes} />}
            <div className="tm-wk__links">
              <a href={pin.kind !== 'hotel' && hotelFor(area.id) ? directionsUrl(pin.location.lat, pin.location.lon, { from: hotelFor(area.id)!.pin.location }) : directionsUrl(pin.location.lat, pin.location.lon)} target="_blank" rel="noopener" className="tm-card__link tm-card__link--quiet">{pin.kind !== 'hotel' && hotelFor(area.id) ? s.trip.directionsFrom(t(hotelFor(area.id)!.pin.name, locale)) : s.card.directions}</a>
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
                    <a key={p} href={buildOutboundUrl(p, pin.links[p]!, subId, stay)} onClick={() => p !== 'official' && trackOutbound(p, subId)} target="_blank" rel={p === 'official' ? 'noopener' : 'noopener sponsored'} className={p === 'official' ? 'tm-card__link tm-card__link--quiet' : 'tm-card__link'}>
                      {p === 'official' ? s.card.official : s.card.open(p.charAt(0).toUpperCase() + p.slice(1))}
                    </a>
                  )
                })}
            </div>
          </li>
        )
  }

  return (
    <>
      <SiteHeader locale={locale} cityId={cityId} />
      <main className="tm-credits tm-saved">
        <h1 className="tm-h2">{s.saved.title}</h1>
        <p className="tm-wk__lead">{sentIds ? s.saved.sent(rows.length) : rows.length > 0 ? s.saved.lead(rows.length) : s.saved.empty}</p>
        {stay && rows.length > 0 && <p className="tm-wk__paper">{[formatDayRange(stay.checkIn, stay.checkOut, locale), s.stay.nights(nights(stay)), s.stay.adults(adultsOf(stay), roomsOf(stay), childrenOf(stay))].join(' · ')}</p>}
        <div className="tm-wk__actions">
          {rows.length > 0 && !sentIds && (
            <button type="button" onClick={share} className="tm-button tm-button--small">
              <Share2 aria-hidden="true" className="size-4" />
              {shared === 'copied' ? s.saved.copied : shared === 'failed' ? s.saved.copyFailed : s.saved.share}
            </button>
          )}
          {rows.length > 0 && (
            <button type="button" onClick={() => window.print()} className="tm-link tm-link--button">
              <Printer aria-hidden="true" className="size-4" />
              {s.saved.print}
            </button>
          )}
          {sentIds && rows.length > 0 && (
            <button type="button" onClick={keep} className="tm-button tm-button--small">{shared === 'kept' ? s.saved.kept : s.saved.keep}</button>
          )}
          {sentIds && <button type="button" onClick={() => { setSentIds(null); window.history.replaceState(null, '', window.location.pathname) }} className="tm-link">{s.saved.mine}</button>}
          {rows.length === 0 && !sentIds && (
            <>
              <Link href={`/${locale}/${cityId}`} className="tm-button tm-button--small">{s.saved.emptyLink}</Link>
              <Link href={`/${locale}#tm-quiz`} className="tm-link tm-link--under">{s.saved.emptyQuiz}</Link>
            </>
          )}
          {rows.length > 0 && !sentIds && <button type="button" onClick={clearSaved} className="tm-link">{s.saved.clear}</button>}
        </div>
        {missing > 0 && <p className="tm-saved__note">{s.saved.unknown(missing)}</p>}
        {hotelRows.length > 1 && (
          <section className="tm-saved__group">
            <h2 className="tm-wk__time">{s.saved.compare}</h2>
            <p className="tm-saved__note">{sentIds ? s.saved.compareLeadSent : s.saved.compareLead}</p>
            <StayPicker locale={locale} />
            <HotelCompare locale={locale} cityId={cityId} entries={hotelRows} stations={stations} nearbyCount={nearbyCount} mine={sentIds ? null : hotelRows.find((e) => pickFor(e.area.id) === e.pin.id && areaHotelCount(e.area.id) > 1)?.pin.id} airport={airport} />
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
      </main>
      <SiteFooter locale={locale} cityId={cityId} />
    </>
  )
}
