import type { Area, Pin, Station, TripRoute } from '@/lib/content/types'
import { simplifyLine } from '@/lib/geo/simplify'

/**
 * Pages that only name an area (a link list, a pin card's colour) do not need
 * its outline or its pins. Measured 2026-10-15: a station page carried every
 * area whole for each of its rows, 288 KB of HTML; a weekend page 476 KB.
 */
export function slimArea(area: Area): Area {
  return { ...area, boundary: undefined, pins: [], subareas: area.subareas.map((sub) => ({ ...sub, boundary: undefined })) }
}

/** Only the stations the given pins walk from, plus any the page names itself. */
export function stationsFor(stations: Station[], pins: Pin[], keep: string[] = []): Station[] {
  const ids = new Set([...keep, ...pins.map((p) => p.walk?.station).filter((id): id is string => !!id)])
  return stations.filter((st) => ids.has(st.id))
}

/** A trip that is only named and linked: no road line, no stops. The two multi-day routes carry 3,000 to 4,000 road points each. */
export function slimRoute(route: TripRoute): TripRoute {
  return { ...route, path: null, waypoints: [], stops: [] }
}

/** A trip drawn small (the home page sheet): the road line thinned to about 110 m steps, the stops kept. */
export function thinRoute(route: TripRoute): TripRoute {
  return { ...route, path: route.path ? simplifyLine(route.path, 0.001) : null }
}
