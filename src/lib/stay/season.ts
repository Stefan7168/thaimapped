/**
 * What the weather usually does in a given month, per city: the typical pattern, never a forecast.
 * Bangkok from the Thai Meteorological Department's climate normals (cool November to February,
 * hot March to May, rains June to October, wettest in September and October).
 */
export type Season = 'cool' | 'hot' | 'rainy' | 'rainyPeak'

const BANGKOK: Record<number, Season> = { 1: 'cool', 2: 'cool', 3: 'hot', 4: 'hot', 5: 'hot', 6: 'rainy', 7: 'rainy', 8: 'rainy', 9: 'rainyPeak', 10: 'rainyPeak', 11: 'cool', 12: 'cool' }

const BY_CITY: Record<string, Record<number, Season>> = { bangkok: BANGKOK }

/** The season of a stay's check-in month in that city, or null where the city has no table yet. */
export function seasonOf(cityId: string, checkIn: string): Season | null {
  const table = BY_CITY[cityId]
  const month = Number(checkIn.slice(5, 7))
  return table?.[month] ?? null
}
