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

/** How a trip's directions are asked for: a car or scooter trip drives, a transit trip rides, the rest walk (the boat trips walk to the pier). */
export const TRAVEL_MODE: Record<RouteMode, TravelMode> = { car: 'driving', scooter: 'driving', transit: 'transit', walk: 'walking', boat: 'walking' }
