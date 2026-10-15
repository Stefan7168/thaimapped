import 'server-only'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Area, City, CityBundle, Country, Line, Station } from './types'

/**
 * Content lives in /content as JSON and is read at build time only.
 * scripts/validate-content.mjs runs before every build, so readers here
 * trust the shape and never guard against malformed files.
 */
const CONTENT_ROOT = join(process.cwd(), 'content')

function read<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(CONTENT_ROOT, relPath), 'utf8')) as T
}

export function loadCountry(): Country {
  return read<Country>('country.json')
}

export function liveCityIds(): string[] {
  return loadCountry().cities.filter((c) => c.status === 'live').map((c) => c.id)
}

export function loadCity(cityId: string): City | null {
  if (!liveCityIds().includes(cityId)) return null
  return read<City>(`cities/${cityId}.json`)
}

export function loadCityBundle(cityId: string): CityBundle | null {
  const city = loadCity(cityId)
  if (!city) return null
  const areas = city.areas.map((id) => read<Area>(`areas/${id}.json`))
  const stations = city.stations ? read<{ stations: Station[] }>(city.stations).stations : []
  const lines = city.lines ? read<{ lines: Line[] }>(city.lines).lines : []
  return { city, areas, stations, lines }
}
