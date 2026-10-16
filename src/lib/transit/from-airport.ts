import type { CityBundle, Localized, Station } from '@/lib/content/types'

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
  // 0-1 search: a change costs nothing, a ride costs one; the first time a station is settled is with the fewest rides.
  const rides = new Map<string, number>([[fromId, 0]])
  const prev = new Map<string, { id: string; ride: boolean }>()
  const queue: string[] = [fromId]
  while (queue.length > 0) {
    const id = queue.shift()!
    const cost = rides.get(id)!
    const st = byId.get(id)!
    for (const other of change.get(id) ?? []) {
      if (!byId.has(other) || (rides.get(other) ?? Infinity) <= cost) continue
      rides.set(other, cost)
      prev.set(other, { id, ride: false })
      queue.unshift(other)
    }
    for (const other of byLine.get(st.line) ?? []) {
      if (other.id === id || (rides.get(other.id) ?? Infinity) <= cost + 1) continue
      rides.set(other.id, cost + 1)
      prev.set(other.id, { id, ride: true })
      queue.push(other.id)
    }
  }
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
