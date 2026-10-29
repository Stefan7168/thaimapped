import type { Area, CityBundle, DayKind, Line, Pin, PinKind, Station, TimeOfDay } from '@/lib/content/types'

export const PIN_KINDS: PinKind[] = ['hotel', 'sight', 'food', 'market', 'nightlife', 'transport']
/** The kinds offered as chips in the What-to-show bar: no Transport chip (Stefan, 2026-10-15); stations are reached through the transit picker, and the one pier pin shows with everything. */
export const KIND_CHIPS: PinKind[] = ['hotel', 'sight', 'food', 'market', 'nightlife']
export const TIERS = ['budget', 'mid', 'luxury'] as const
export const TIMES: TimeOfDay[] = ['morning', 'afternoon', 'evening', 'night']
export const DAYS: DayKind[] = ['weekday', 'weekend']
export type Tier = (typeof TIERS)[number]
/** The price-per-night slider, THB. */
export const PRICE_RANGE = { min: 500, max: 15000, step: 100 } as const
export interface PriceRange {
  min: number
  max: number
}
/** What each quiz budget answer means on the slider. */
export const TIER_PRICE: Record<Tier, PriceRange> = { budget: { min: PRICE_RANGE.min, max: 1500 }, mid: { min: 1500, max: 4000 }, luxury: { min: 4000, max: PRICE_RANGE.max } }
/** Rough, for the label next to the slider only. Update now and then. */
export const THB_PER_USD = 36
export const isFullRange = (r: PriceRange | null) => !r || (r.min <= PRICE_RANGE.min && r.max >= PRICE_RANGE.max)
/** A hotel passes when it has no price or its "from" price sits inside the range; places always pass. */
export function fitsPrice(pin: Pin, r: PriceRange | null): boolean {
  if (isFullRange(r) || pin.kind !== 'hotel' || !pin.price) return true
  return pin.price.from >= r!.min && pin.price.from <= r!.max
}

/** Walking radius used for "near a station". 800 m is about 10 minutes. */
export const WALK_RADIUS_M = 800

export interface FilterState {
  /** Whole areas, like whole lines. */
  areas: string[]
  /** Sub-areas, as `area/subarea`, like single stations. */
  subareas: string[]
  stations: string[]
  /** Whole lines, as `SYSTEM/Line`. */
  lines: string[]
  kinds: PinKind[]
  tiers: Tier[]
  /** Price per night, THB, hotels only; null or the full range means off. */
  price: PriceRange | null
  /** When: a place with no `when` passes; one with it must fit every picked time and day. */
  times: TimeOfDay[]
  days: DayKind[]
  /** The visitor's own position (lon, lat) from the browser, for "near me"; never written to the address. */
  near: [number, number] | null
  /** Who stands at `near`: unset for the visitor's own position, the hotel's name for "near your hotel". */
  nearName?: string | null
  /** The hotel pin `near` stands on, when it is a hotel: the one part of "near" the address may carry. */
  nearPin?: string | null
}

export const EMPTY_FILTERS: FilterState = { areas: [], subareas: [], stations: [], lines: [], kinds: [], tiers: [], price: null, times: [], days: [], near: null }

/** "Near me" reaches a little further than a station's walk circle: 1,200 m is about a 15-minute walk. */
export const NEAR_RADIUS_M = 1200

export function subareaKey(areaId: string, subId: string): string {
  return `${areaId}/${subId}`
}

export function activeFilterCount(f: FilterState): number {
  return f.areas.length + f.subareas.length + f.stations.length + f.lines.length + f.kinds.length + f.tiers.length + (isFullRange(f.price) ? 0 : 1) + f.times.length + f.days.length + (f.near ? 1 : 0)
}

export function lineKey(s: { system: string; line: string }): string {
  return `${s.system}/${s.line}`
}

export function distanceM(aLon: number, aLat: number, bLon: number, bLat: number): number {
  const r = 6_371_000
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(bLat - aLat)
  const dLon = toRad(bLon - aLon)
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2
  return 2 * r * Math.asin(Math.sqrt(h))
}

export interface VisiblePin {
  pin: Pin
  area: Area
}

/** Walking pace used for the "walkable from here" tip, metres per minute, as the crow flies. */
export const WALK_PACE_M_PER_MIN = 75
/** The tip lists places within this many minutes. */
export const NEARBY_MINUTES = 15

export interface NearbyPin extends VisiblePin {
  /** Straight-line distance, so an estimate: streets and canals add to it. */
  minutes: number
}

/** Every pin of the city with its area, for the tip and the search. */
export function allPins(bundle: CityBundle): VisiblePin[] {
  return bundle.areas.flatMap((area) => area.pins.map((pin) => ({ pin, area })))
}

/** Other places within NEARBY_MINUTES of a pin, nearest first, at most `limit`. */
export function nearbyPins(from: Pin, pins: VisiblePin[], limit = 4): NearbyPin[] {
  return pins
    .filter(({ pin }) => pin.id !== from.id)
    .map((p) => ({ ...p, minutes: Math.max(1, Math.ceil(distanceM(from.location.lon, from.location.lat, p.pin.location.lon, p.pin.location.lat) / WALK_PACE_M_PER_MIN)) }))
    .filter((p) => p.minutes <= NEARBY_MINUTES)
    .sort((a, b) => a.minutes - b.minutes)
    .slice(0, limit)
}

/** Stations that count as selected: picked individually or via a whole line. */
export function selectedStations(bundle: CityBundle, f: FilterState): Station[] {
  const picked = new Set(f.stations)
  const lines = new Set(f.lines)
  return bundle.stations.filter((st) => picked.has(st.id) || lines.has(lineKey(st)))
}

/**
 * The pins the map and list show. No filter at all shows nothing but the
 * area labels (the city overview). Any filter narrows every area's pins.
 */
export function visiblePins(bundle: CityBundle, f: FilterState): VisiblePin[] {
  if (activeFilterCount(f) === 0) return []
  const areaSet = new Set(f.areas)
  const subSet = new Set(f.subareas)
  const placeFilterOn = areaSet.size > 0 || subSet.size > 0
  const kinds = new Set(f.kinds)
  const tiers = new Set<string>(f.tiers)
  const stations = selectedStations(bundle, f)
  const out: VisiblePin[] = []
  for (const area of bundle.areas) {
    for (const pin of area.pins) {
      if (placeFilterOn) {
        const inArea = areaSet.has(area.id)
        const inSub = pin.subarea !== undefined && subSet.has(subareaKey(area.id, pin.subarea))
        if (!inArea && !inSub) continue
      }
      if (kinds.size > 0 && !kinds.has(pin.kind)) continue
      // The budget is a hotel budget: it narrows the hotels and leaves the places alone.
      if (tiers.size > 0 && pin.kind === 'hotel' && (!pin.tier || !tiers.has(pin.tier))) continue
      if (!fitsPrice(pin, f.price)) continue
      if (!fitsWhen(pin, f)) continue
      // A time of day picked with no kind is a question about places, so the hotels step aside; the Hotel chip brings them back.
      if (f.times.length > 0 && kinds.size === 0 && pin.kind === 'hotel') continue
      if (stations.length > 0) {
        const near = stations.some((st) => distanceM(st.lon, st.lat, pin.location.lon, pin.location.lat) <= WALK_RADIUS_M)
        if (!near) continue
      }
      if (f.near && distanceM(f.near[0], f.near[1], pin.location.lon, pin.location.lat) > NEAR_RADIUS_M) continue
      out.push({ pin, area })
    }
  }
  if (f.near) {
    const [lon, lat] = f.near
    out.sort((a, b) => distanceM(lon, lat, a.pin.location.lon, a.pin.location.lat) - distanceM(lon, lat, b.pin.location.lon, b.pin.location.lat))
  }
  return out
}

/** Hotels and places with no `when` fit any time; a place with `when` must be good at one picked time and open on one picked day kind. */
export function fitsWhen(pin: Pin, f: FilterState): boolean {
  if (f.times.length === 0 && f.days.length === 0) return true
  if (!pin.when) return true
  if (f.times.length > 0 && !f.times.some((t) => pin.when!.times.includes(t))) return false
  if (f.days.length > 0 && pin.when.days && !f.days.some((d) => pin.when!.days!.includes(d))) return false
  return true
}

export interface LineGroup {
  line: Line
  stations: Station[]
}

export const SYSTEM_ORDER = ['BTS', 'MRT', 'ARL', 'SRT'] as const

/** Codes sort by number inside the letter prefix: E1, E2, E10, not E1, E10, E2. */
const CODE_COLLATOR = new Intl.Collator('en', { numeric: true, sensitivity: 'base' })

/** Stations grouped system then line, in a fixed display order, sorted by code. */
export function groupBySystem(bundle: CityBundle): Map<string, LineGroup[]> {
  const byLine = new Map<string, Station[]>()
  for (const st of bundle.stations) {
    const k = lineKey(st)
    byLine.set(k, [...(byLine.get(k) ?? []), st])
  }
  for (const list of byLine.values()) list.sort((a, b) => CODE_COLLATOR.compare(a.code || a.name.en, b.code || b.name.en))
  const result = new Map<string, LineGroup[]>()
  for (const line of bundle.lines) {
    const stations = byLine.get(lineKey(line))
    if (!stations) continue
    result.set(line.system, [...(result.get(line.system) ?? []), { line, stations }])
  }
  return result
}

export function lineColor(bundle: CityBundle, st: { system: string; line: string }): string {
  return bundle.lines.find((l) => l.system === st.system && l.line === st.line)?.color ?? '#6f6a5f'
}

/** Centres of every selected sub-area and whole area, for framing when no pin matches. */
export function selectedPlaceCentres(bundle: CityBundle, f: FilterState): [number, number][] {
  const out: [number, number][] = []
  for (const area of bundle.areas) {
    if (f.areas.includes(area.id)) out.push(area.camera.center)
    for (const sub of area.subareas) if (f.subareas.includes(subareaKey(area.id, sub.id))) out.push(sub.center)
  }
  return out
}
