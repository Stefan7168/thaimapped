import type { Area, CityBundle, Line, Pin, Station } from '@/lib/content/types'
import { distanceM, WALK_PACE_M_PER_MIN, WALK_RADIUS_M } from './filters'

export interface StationPin {
  pin: Pin
  area: Area
  /** Minutes on foot: the content's checked walk when the pin names this station, else the straight-line estimate. */
  minutes: number
  estimated: boolean
}

export interface StationPage {
  /** URL part: the operator code and the name, such as e4-asok. */
  slug: string
  /** One per line that stops here; an interchange lists two. */
  stations: Station[]
  lines: Line[]
  hotels: StationPin[]
  places: StationPin[]
}

const slugOf = (st: Station) => `${st.code || st.id}-${st.name.en}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * The stations worth a page of their own: every station with at least one
 * hotel or two places within the walk radius. Stations that share a code and
 * a name (Siam on both BTS lines) become one page. Hotels first, nearest first.
 */
export function stationPages(bundle: CityBundle): StationPage[] {
  const groups = new Map<string, Station[]>()
  for (const st of bundle.stations) {
    const key = `${st.code}|${st.name.en}`
    groups.set(key, [...(groups.get(key) ?? []), st])
  }
  const pages: StationPage[] = []
  for (const stations of groups.values()) {
    const first = stations[0]
    const ids = new Set(stations.map((s) => s.id))
    const near: StationPin[] = []
    for (const area of bundle.areas) {
      for (const pin of area.pins) {
        const m = distanceM(first.lon, first.lat, pin.location.lon, pin.location.lat)
        if (m > WALK_RADIUS_M) continue
        const checked = pin.walk && ids.has(pin.walk.station) ? pin.walk.minutes : null
        near.push({ pin, area, minutes: checked ?? Math.max(1, Math.ceil(m / WALK_PACE_M_PER_MIN)), estimated: checked === null })
      }
    }
    near.sort((a, b) => a.minutes - b.minutes)
    const hotels = near.filter((n) => n.pin.kind === 'hotel')
    const places = near.filter((n) => n.pin.kind !== 'hotel')
    if (hotels.length === 0 && places.length < 2) continue
    const lines = stations.map((st) => bundle.lines.find((l) => l.system === st.system && l.line === st.line)).filter((l): l is Line => Boolean(l))
    pages.push({ slug: slugOf(first), stations, lines, hotels, places })
  }
  return pages.sort((a, b) => b.hotels.length * 2 + b.places.length - (a.hotels.length * 2 + a.places.length))
}
