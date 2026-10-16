'use client'

import { useMemo } from 'react'
import type { Area, Locale } from '@/lib/content/types'
import type { HotelDoor } from '@/lib/content/slim'
import { t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { myHotelChoice } from '@/lib/saved/my-hotel'
import type { AirportLeg } from '@/lib/transit/from-airport'
import { rideSentence } from './from-airport'

export type Rides = Record<string, Record<string, AirportLeg[] | null>>

/**
 * The reader's hotel in another area, when this area has none saved: the
 * first saved (or the one chosen for its area) and the ride from its
 * station to this area's first station. `choiceVersion` is any value that
 * changes when the choice does, so the pick recomputes.
 */
export function useHotelElsewhere(area: Area, areas: Area[], hotelDoors: Record<string, HotelDoor[]>, elsewhereRides: Rides, saved: readonly string[], skip: boolean, locale: Locale, choiceVersion: unknown) {
  return useMemo(() => {
    if (skip) return null
    for (const [areaId, doors] of Object.entries(hotelDoors)) {
      if (areaId === area.id) continue
      const mine = doors.filter((h) => saved.includes(h.id))
      if (mine.length === 0) continue
      const hotel = mine.find((h) => h.id === myHotelChoice(areaId)) ?? mine[0]
      const other = areas.find((a) => a.id === areaId)
      const legs = hotel.walk && area.stations[0] ? elsewhereRides[hotel.walk.station]?.[area.stations[0]] : undefined
      return { hotel, areaName: other ? t(other.name, locale) : areaId, route: legs && legs.length > 0 ? rideSentence(legs, null, locale) : null }
    }
    return null
    // choiceVersion is read so a new choice recomputes the pick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [skip, hotelDoors, saved, area.id, area.stations, areas, elsewhereRides, locale, choiceVersion])
}

/** The line under the page's lead: "You sleep in Ari, at The Quarter Hotel. Getting here: ..." with a link to this area's hotels. */
export function HotelElsewhere({ locale, area, elsewhere }: { locale: Locale; area: Area; elsewhere: NonNullable<ReturnType<typeof useHotelElsewhere>> }) {
  const s = strings(locale)
  return (
    <p className="tm-wk__shared tm-wk__elsewhere">
      {s.weekendPage.sleepElsewhere(t(elsewhere.hotel.name, locale), elsewhere.areaName)}{elsewhere.route ? ` ${s.weekendPage.gettingHere(elsewhere.route)}` : ''} <a href="#tm-stay" className="tm-link tm-link--under">{s.weekendPage.sleepHere(t(area.name, locale))}</a>
    </p>
  )
}
