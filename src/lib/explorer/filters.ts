import type { Area, CityBundle, Line, Pin, PinKind, Station } from '@/lib/content/types'

export const PIN_KINDS: PinKind[] = ['hotel', 'sight', 'food', 'market', 'nightlife', 'transport']
export const TIERS = ['budget', 'mid', 'luxury'] as const
export type Tier = (typeof TIERS)[number]

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
}

export const EMPTY_FILTERS: FilterState = { areas: [], subareas: [], stations: [], lines: [], kinds: [], tiers: [] }

export function subareaKey(areaId: string, subId: string): string {
  return `${areaId}/${subId}`
}

export function activeFilterCount(f: FilterState): number {
  return f.areas.length + f.subareas.length + f.stations.length + f.lines.length + f.kinds.length + f.tiers.length
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
      if (tiers.size > 0 && (!pin.tier || !tiers.has(pin.tier))) continue
      if (stations.length > 0) {
        const near = stations.some((st) => distanceM(st.lon, st.lat, pin.location.lon, pin.location.lat) <= WALK_RADIUS_M)
        if (!near) continue
      }
      out.push({ pin, area })
    }
  }
  return out
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
