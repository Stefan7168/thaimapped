import type { CityBundle, Localized, Station } from '@/lib/content/types'
import { hotelDoors, type HotelDoor } from '@/lib/content/slim'
import { distanceM } from '@/lib/explorer/filters'

/** One ride on one line, from the station you board to the one you leave. */
export interface AirportLeg {
  system: string
  line: string
  from: { code: string; name: Localized }
  to: { code: string; name: Localized }
}

/** The legs from each airport to a station, or null when the lines do not connect. */
export interface AirportRoutes {
  suvarnabhumi: AirportLeg[] | null
  donMueang: AirportLeg[] | null
}

/** The rail stations at the two airports, by station id in the city's station file. */
export const AIRPORT_STATIONS: Record<string, { suvarnabhumi: string; donMueang: string }> = {
  bangkok: { suvarnabhumi: 'arl-airport-rail-link-a1', donMueang: 'srt-dark-red-rn08' },
}

/**
 * The fewest rides from one station to another: a ride is any stretch of one
 * line, a change is one of the published interchanges. Minutes are not
 * known, so the result is legs, never a time. Null when no chain of lines
 * and interchanges joins the two.
 */
export function railLegs(stations: Station[], interchanges: [string, string][], fromId: string, toId: string): AirportLeg[] | null {
  const byId = new Map(stations.map((st) => [st.id, st]))
  if (!byId.has(fromId) || !byId.has(toId)) return null
  if (fromId === toId) return []
  const byLine = new Map<string, Station[]>()
  for (const st of stations) byLine.set(st.line, [...(byLine.get(st.line) ?? []), st])
  const change = new Map<string, string[]>()
  for (const [a, b] of interchanges) {
    change.set(a, [...(change.get(a) ?? []), b])
    change.set(b, [...(change.get(b) ?? []), a])
  }
  // Fewest rides first, shortest distance second: a change costs no ride, a ride costs one ride plus its straight-line
  // length, so of two two-ride chains the one that does not loop round the city wins (Siam to Sanam Chai via Si Lom, not via Bang Wa).
  const RIDE = 1_000_000
  const cost = new Map<string, number>([[fromId, 0]])
  const prev = new Map<string, { id: string; ride: boolean }>()
  const open = new Set<string>([fromId])
  const done = new Set<string>()
  while (open.size > 0) {
    let id = ''
    let best = Infinity
    for (const candidate of open) if (cost.get(candidate)! < best) { best = cost.get(candidate)!; id = candidate }
    open.delete(id)
    done.add(id)
    if (id === toId) break
    const st = byId.get(id)!
    const relax = (other: string, extra: number, ride: boolean) => {
      if (done.has(other) || (cost.get(other) ?? Infinity) <= best + extra) return
      cost.set(other, best + extra)
      prev.set(other, { id, ride })
      open.add(other)
    }
    for (const other of change.get(id) ?? []) if (byId.has(other)) relax(other, 0, false)
    for (const other of byLine.get(st.line) ?? []) if (other.id !== id) relax(other.id, RIDE + distanceM(st.lon, st.lat, other.lon, other.lat), true)
  }
  const rides = cost
  if (!rides.has(toId)) return null
  const legs: AirportLeg[] = []
  let at = toId
  while (at !== fromId) {
    const p = prev.get(at)!
    if (p.ride) {
      const a = byId.get(p.id)!
      const b = byId.get(at)!
      legs.unshift({ system: a.system, line: a.line, from: { code: a.code, name: a.name }, to: { code: b.code, name: b.name } })
    }
    at = p.id
  }
  return legs
}

/** The legs from both airports to each of the given stations, for a page to carry with its hotels. */
/** Rail legs from each `fromIds` station to each `toIds` station, keyed from -> to. Pairs with no rail chain are null; the same station is []. */
export function railLegsBetween(bundle: CityBundle, fromIds: Iterable<string>, toIds: Iterable<string>): Record<string, Record<string, AirportLeg[] | null>> {
  const out: Record<string, Record<string, AirportLeg[] | null>> = {}
  const tos = [...new Set(toIds)]
  for (const from of new Set(fromIds)) {
    out[from] = {}
    for (const to of tos) out[from][to] = railLegs(bundle.stations, bundle.interchanges, from, to)
  }
  return out
}

export function airportRoutesFor(bundle: CityBundle, stationIds: Iterable<string>): Record<string, AirportRoutes> {
  const airports = AIRPORT_STATIONS[bundle.city.id]
  const out: Record<string, AirportRoutes> = {}
  if (!airports) return out
  for (const id of new Set(stationIds)) {
    out[id] = {
      suvarnabhumi: railLegs(bundle.stations, bundle.interchanges, airports.suvarnabhumi, id),
      donMueang: railLegs(bundle.stations, bundle.interchanges, airports.donMueang, id),
    }
  }
  return out
}

/**
 * For an area page or weekend page: the other areas' hotels as doors, their
 * stations, and the rides from those stations to this area's first station.
 */
export function elsewhereFor(bundle: CityBundle, area: { id: string; stations: string[] }): { doors: Record<string, HotelDoor[]>; stations: string[]; rides: Record<string, Record<string, AirportLeg[] | null>> } {
  const doors = hotelDoors(bundle.areas.filter((x) => x.id !== area.id))
  const stations = [...new Set(Object.values(doors).flat().map((h) => h.walk?.station).filter((id): id is string => !!id))]
  return { doors, stations, rides: railLegsBetween(bundle, stations, area.stations.slice(0, 1)) }
}
