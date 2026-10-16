import type { Locale } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import type { AirportLeg, AirportRoutes } from '@/lib/transit/from-airport'

/** "A8 Phaya Thai", or just the name where the operator publishes no code. */
const stop = (x: AirportLeg['from'], locale: Locale) => `${x.code ? x.code + ' ' : ''}${t(x.name, locale)}`

/** "Airport Rail Link" stays as it is; the others read "BTS Sukhumvit", "MRT Blue". */
const lineName = (leg: AirportLeg) => (leg.line.toLowerCase().includes(leg.system.toLowerCase()) || leg.system === 'ARL' ? leg.line : `${leg.system} ${leg.line}`)

/** The rides of a chain in words, with the first stop named: "BTS Sukhumvit from N7 Saphan Khwai to N8 Mo Chit, change at A8 Phaya Thai to the ..., then 5 min on foot". */
export function rideSentence(legs: AirportLeg[], walkMinutes: number, locale: Locale): string {
  const s = strings(locale)
  const rides = legs.map((leg, i) => (i === 0 ? s.airport.rideFrom(lineName(leg), stop(leg.from, locale), stop(leg.to, locale)) : s.airport.change(stop(leg.from, locale), lineName(leg), stop(leg.to, locale))))
  return `${rides.join(', ')}, ${s.airport.thenWalk(walkMinutes)}`
}

/**
 * One short cell for the hotels table: "Airport Rail Link to A8 Phaya Thai",
 * "2 rides, change at A8 Phaya Thai", "Airport station" or "No rail line".
 */
export function airportCell(legs: AirportLeg[] | null | undefined, locale: Locale): string {
  const s = strings(locale)
  if (legs === undefined) return ''
  if (legs === null) return s.airport.noRailShort
  if (legs.length === 0) return s.airport.sameStationShort
  if (legs.length === 1) return s.airport.ride(lineName(legs[0]), stop(legs[0].to, locale))
  return s.airport.ridesChange(legs.length, stop(legs[0].to, locale))
}

/**
 * How to reach a hotel's station from each airport by rail: the rides and
 * where to change, from the city's lines and published interchanges. No
 * minutes, because none are known. Folded by default under one line.
 */
export function FromAirport({ locale, routes, walkMinutes }: { locale: Locale; routes: AirportRoutes; walkMinutes: number }) {
  const s = strings(locale)
  const sentence = (legs: AirportLeg[] | null) => {
    if (!legs) return s.airport.noRail
    if (legs.length === 0) return s.airport.sameStation
    const rides = legs.map((leg, i) => (i === 0 ? s.airport.ride(lineName(leg), stop(leg.to, locale)) : s.airport.change(stop(leg.from, locale), lineName(leg), stop(leg.to, locale))))
    return `${rides.join(', ')}, ${s.airport.thenWalk(walkMinutes)}`
  }
  return (
    <details className="tm-airport">
      <summary className="tm-airport__summary">{s.airport.summary}</summary>
      <p className="tm-airport__line"><strong>{s.airport.suvarnabhumi}</strong> {sentence(routes.suvarnabhumi)}</p>
      <p className="tm-airport__line"><strong>{s.airport.donMueang}</strong> {sentence(routes.donMueang)}</p>
      <p className="tm-airport__note">{s.airport.note}</p>
    </details>
  )
}
