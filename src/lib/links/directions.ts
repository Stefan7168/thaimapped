import type { RouteMode } from '@/lib/content/types'

/**
 * A directions link a phone understands: Google Maps' universal URL opens
 * the Maps app where it is installed and the web map elsewhere. The point
 * is the place's own position, so the route ends at the door, not at a
 * name search. No partner, no tracking.
 */
export type TravelMode = 'walking' | 'driving' | 'transit'

export function directionsUrl(lat: number, lon: number, opts: { mode?: TravelMode; from?: { lat: number; lon: number } } = {}): string {
  const origin = opts.from ? `&origin=${opts.from.lat.toFixed(6)},${opts.from.lon.toFixed(6)}` : ''
  return `https://www.google.com/maps/dir/?api=1${origin}&destination=${lat.toFixed(6)},${lon.toFixed(6)}&travelmode=${opts.mode ?? 'walking'}`
}

/**
 * One directions link for a whole day: first stop to last with the rest as waypoints, in order. Google Maps
 * takes up to nine waypoints on this URL, so a longer day keeps its first eight middle stops and the last one.
 */
export function dayDirectionsUrl(points: { lat: number; lon: number }[], mode: TravelMode): string | null {
  if (points.length < 2) return null
  const p = (x: { lat: number; lon: number }) => `${x.lat.toFixed(6)},${x.lon.toFixed(6)}`
  const middle = points.slice(1, -1).slice(0, 9)
  const waypoints = middle.length ? `&waypoints=${middle.map(p).join('|')}` : ''
  return `https://www.google.com/maps/dir/?api=1&origin=${p(points[0])}&destination=${p(points[points.length - 1])}${waypoints}&travelmode=${mode}`
}

/** How a trip's directions are asked for: a car or scooter trip drives, a transit trip rides, the rest walk (the boat trips walk to the pier). */
export const TRAVEL_MODE: Record<RouteMode, TravelMode> = { car: 'driving', scooter: 'driving', transit: 'transit', walk: 'walking', boat: 'walking' }
