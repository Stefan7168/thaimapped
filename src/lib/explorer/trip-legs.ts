import type { TripRoute } from '@/lib/content/types'
import { distanceM } from '@/lib/explorer/filters'

export interface TripLeg {
  /** Metres from the previous stop; 0 on the first stop, which nothing leads to. */
  m: number
  /** True when one end is off the drawn line, so this is the straight line between the two stops rather than the road. */
  straight: boolean
}

/** A stop farther than this from the drawn line is not on it: the line goes past, not through. */
const ON_LINE_M = 2500

/**
 * The distance from each stop to the next, measured along the route's drawn line where both stops sit on it,
 * and as the straight line between them where one does not (a park waterfall the main road never reaches).
 * Stops snap to the nearest point on the line at or after the previous on-line stop's point, so a route that
 * doubles back (out and home) is measured in travel order, not by whichever pass is closest.
 */
export function tripLegs(route: TripRoute): TripLeg[] {
  const line = route.path
  const stops = route.stops
  const straightTo = (i: number) => distanceM(stops[i - 1].location.lon, stops[i - 1].location.lat, stops[i].location.lon, stops[i].location.lat)
  if (!line || line.length < 2) return stops.map((_, i) => ({ m: i === 0 ? 0 : straightTo(i), straight: true }))
  const cum: number[] = [0]
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distanceM(line[i - 1][0], line[i - 1][1], line[i][0], line[i][1]))
  let from = 0
  const at: (number | null)[] = []
  for (const stop of stops) {
    const { lon, lat } = stop.location
    let best = from
    let bestD = Infinity
    for (let j = from; j < line.length; j++) {
      const d = distanceM(lon, lat, line[j][0], line[j][1])
      if (d < bestD) { bestD = d; best = j }
    }
    if (bestD > ON_LINE_M) { at.push(null); continue }
    at.push(cum[best])
    from = best
  }
  return stops.map((_, i) => {
    if (i === 0) return { m: 0, straight: false }
    const a = at[i - 1], b = at[i]
    const direct = straightTo(i)
    // A road leg can never be shorter than the straight line: when it is, a stop snapped to the wrong point (both to one pier), so the straight line is the honest figure.
    return a !== null && b !== null && b - a >= direct * 0.9 ? { m: b - a, straight: false } : { m: direct, straight: true }
  })
}

/** Kilometres for a leg line: one decimal under 10 km, whole above, never below 0.1. */
export function legKm(metres: number): number {
  const km = metres / 1000
  return km < 10 ? Math.max(0.1, Math.round(km * 10) / 10) : Math.round(km)
}
