'use client'

import Link from 'next/link'
import type { Area, Locale, Pin, Station } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { buildOutboundUrl, subIdFor, type Partner } from '@/lib/links/build'
import { roomsOf, useStay } from '@/lib/stay/store'
import { formatDayRange } from '@/lib/stay/format'
import { useHereNights } from '@/lib/stay/trip-start'
import type { TripNights } from '@/lib/content/slim'
import { trackOutbound } from '@/lib/links/track'
import { thb } from '@/lib/explorer/price'
import { CmpWrap } from './cmp-wrap'
import { airportCell } from './from-airport'
import type { AirportRoutes } from '@/lib/transit/from-airport'

export interface CompareEntry {
  pin: Pin
  area: Pick<Area, 'id' | 'name' | 'color'>
}

/**
 * Hotels side by side: a night, the stay total once dates are set, the walk
 * to the train, what is walkable, where to book. The saved page shows the
 * area row and a "Plan it" row too; an area or weekend page leaves both out.
 */
export function HotelCompare({ locale, cityId, entries, stations, nearbyCount, showArea = true, mine, airport = {}, trips = [], plan }: {
  /** The city's trips slimmed for the nights-here count: a kept road trip's nights away leave the totals and the booking dates. */
  trips?: TripNights[]
  /** A shared plan's trips and days, when the page shows a sent plan rather than this browser's own. */
  plan?: { ids: readonly string[]; picks: Readonly<Record<string, string>> }
  locale: Locale
  cityId: string
  entries: CompareEntry[]
  stations: Station[]
  nearbyCount: (hotel: Pin) => number
  showArea?: boolean
  /** The hotel the plan walks from, when one is picked: its column says so under the name. */
  mine?: string | null
  /** Rail routes from the airports by station id; the row shows only when some hotel has one. */
  airport?: Record<string, AirportRoutes>
}) {
  const s = strings(locale)
  const stay = useStay()
  const { hereNights, away, bookStay } = useHereNights(stay, trips, plan)
  const stationById = new Map(stations.map((st) => [st.id, st]))
  const fromAirport = (pin: Pin) => (pin.walk ? airport[pin.walk.station]?.suvarnabhumi : undefined)
  const airportRow = entries.some((e) => fromAirport(e.pin) !== undefined)
  return (
    <>
      <CmpWrap locale={locale}>
        <table className="tm-cmp">
          <thead>
            <tr>
              <th scope="col"><span className="sr-only">{s.saved.compareWhat}</span></th>
              {entries.map((e) => (
                <th key={e.pin.id} scope="col">
                  {t(e.pin.name, locale)}
                  {e.pin.id === mine && <span className="tm-cmp__mine">{s.saved.cmpMine}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {showArea && (
              <tr>
                <th scope="row">{s.saved.cmpArea}</th>
                {entries.map((e) => <td key={e.pin.id}><Link href={`/${locale}/${cityId}/area/${e.area.id}`} className="tm-link">{t(e.area.name, locale)}</Link></td>)}
              </tr>
            )}
            <tr>
              <th scope="row">{s.saved.cmpPrice}</th>
              {entries.map((e) => <td key={e.pin.id}>{e.pin.price ? `${s.guide.priceFrom(thb(e.pin.price.from, locale))}${e.pin.price.basis === 'tier-estimate' ? '*' : ''}` : (e.pin.tier ? s.filters.tier[e.pin.tier] : '')}</td>)}
            </tr>
            {stay && hereNights > 0 && (
              <tr>
                <th scope="row">{s.saved.cmpStay(hereNights, roomsOf(stay))}{away.length > 0 ? s.saved.cmpStayAway(away.length) : ''}</th>
                {entries.map((e) => <td key={e.pin.id}>{e.pin.price ? `${s.guide.about(thb(e.pin.price.from * hereNights * roomsOf(stay), locale))}${e.pin.price.basis === 'tier-estimate' ? '*' : ''}` : ''}</td>)}
              </tr>
            )}
            <tr>
              <th scope="row">{s.saved.cmpStation}</th>
              {entries.map((e) => { const st = e.pin.walk ? stationById.get(e.pin.walk.station) : undefined; return <td key={e.pin.id}>{st && e.pin.walk ? `${s.city.walkMinutes(e.pin.walk.minutes)}, ${st.code ? st.code + ' ' : ''}${t(st.name, locale)}` : ''}</td> })}
            </tr>
            {airportRow && (
              <tr>
                <th scope="row">{s.saved.cmpAirport}</th>
                {entries.map((e) => <td key={e.pin.id}>{airportCell(fromAirport(e.pin), locale)}</td>)}
              </tr>
            )}
            <tr>
              <th scope="row">{s.saved.cmpNearby}</th>
              {entries.map((e) => <td key={e.pin.id}>{s.saved.cmpPlaces(nearbyCount(e.pin))}</td>)}
            </tr>
            {showArea && (
              <tr>
                <th scope="row">{s.home.compare.weekend}</th>
                {entries.map((e) => <td key={e.pin.id}><Link href={`/${locale}/${cityId}/weekend/${e.area.id}?hotel=${e.pin.id}`} className="tm-link">{s.home.compare.plan}</Link></td>)}
              </tr>
            )}
            {/* No book row when a road trip takes every night of the stay: nothing here to book. */}
            {!(stay && hereNights === 0 && away.length > 0) && (
            <tr>
              <th scope="row">{s.saved.cmpBook}</th>
              {entries.map((e) => (
                <td key={e.pin.id} className="tm-cmp__links">
                  {(Object.keys(e.pin.links) as Partner[]).filter((p) => p !== 'official').map((p) => {
                    const subId = subIdFor(`${cityId}-${e.area.id}`, e.pin.id)
                    return <a key={p} href={buildOutboundUrl(p, e.pin.links[p]!, subId, bookStay)} onClick={() => trackOutbound(p, subId)} target="_blank" rel="noopener sponsored" className="tm-link">{p.charAt(0).toUpperCase() + p.slice(1)}</a>
                  })}
                </td>
              ))}
            </tr>
            )}
          </tbody>
        </table>
      </CmpWrap>
      {stay && bookStay && (bookStay.checkIn !== stay.checkIn || bookStay.checkOut !== stay.checkOut) && <p className="tm-saved__note">{s.guide.bookOn(formatDayRange(bookStay.checkIn, bookStay.checkOut, locale))}</p>}
      <p className="tm-saved__note">* {s.guide.priceEstimate}</p>
    </>
  )
}
