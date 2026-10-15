import type { Locale } from '@/lib/content/types'

/**
 * UI strings. Every user-visible label lives here, keyed, so a second locale
 * is a second object and not a hunt through components.
 */
const en = {
  brand: 'ThaiMapped',
  nav: { cities: 'Cities' },
  country: { comingSoon: 'Coming soon', explore: 'Explore' },
  search: {
    placeholder: 'Search an area, station or place',
    noMatch: 'Nothing matches that.',
    kindArea: 'Area',
    kindStation: 'Station',
  },
  filters: {
    title: 'Filters',
    open: 'Filters',
    close: 'Done',
    clearAll: 'Clear all',
    transit: 'Near a station',
    transitSearch: 'Search stations',
    transitClear: 'Clear station search',
    transitNoMatch: 'No station matches that.',
    removeStation: (label: string) => `Remove ${label}`,
    addStation: 'Add station',
    allStations: 'All stations',
    areas: 'Areas',
    kinds: 'What to show',
    tiers: 'Hotel budget',
    tier: { budget: 'Budget', mid: 'Mid-range', luxury: 'Luxury' } as Record<string, string>,
    results: (n: number) => (n === 1 ? '1 place' : `${n} places`),
    emptyHint: 'Pick an area or a station to see places. Or tap an area on the map.',
    noResults: 'No places match these filters yet.',
  },
  city: {
    walkMinutes: (n: number) => `${n} min walk`,
    from: (station: string) => `from ${station}`,
    flat: '2D',
    tilt: '3D',
  },
  pin: { hotel: 'Hotel', sight: 'Sight', food: 'Food', market: 'Market', nightlife: 'Nightlife', transport: 'Transport' } as Record<string, string>,
  footer: {
    data: 'Map data (c) OpenStreetMap contributors, ODbL. Tiles by OpenFreeMap.',
    affiliate: 'Some links earn us a commission at no cost to you.',
  },
} as const

export type Strings = typeof en

const STRINGS: Record<Locale, Strings> = { en, th: en, es: en, pt: en, zh: en }

export function strings(locale: Locale): Strings {
  return STRINGS[locale]
}
