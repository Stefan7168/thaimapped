import type { Locale } from '@/lib/content/types'

/**
 * UI strings. Every user-visible label lives here, keyed, so a second locale
 * is a second object and not a hunt through components.
 */
const en = {
  brand: 'ThaiMapped',
  nav: { cities: 'Cities', trips: 'Trips' },
  trip: {
    heading: 'Weekend trips',
    intro: 'Road trips with the route, the stops and a place to sleep, day by day.',
    day: (n: number) => `Day ${n}`,
    days: (n: number) => (n === 1 ? '1 day' : `${n} days`),
    km: (n: number) => `${n} km`,
    mode: { car: 'By car', scooter: 'By scooter', transit: 'By train and bus', walk: 'On foot', boat: 'By boat' } as Record<string, string>,
    pathNote: 'Straight lines between stops for now. The road-following line comes from the routing step.',
    back: 'Back to the map',
    filters: { duration: 'How long', days: 'Days', mode: 'How', theme: 'What for', clear: 'Clear', none: 'No trip matches these filters yet.', count: (n: number) => (n === 1 ? '1 trip' : `${n} trips`) },
    duration: { morning: 'Morning', afternoon: 'Afternoon', evening: 'Evening', 'full-day': 'Full day', 'multi-day': 'Multi-day' } as Record<string, string>,
    dayCount: { '1': '1 day', '2': '2 days', '3': '3 days', '4+': '4 days or more' } as Record<string, string>,
    theme: { culture: 'Culture', nature: 'Nature', food: 'Food', city: 'City', beach: 'Beach', nightlife: 'Nightlife' } as Record<string, string>,
  },
  stop: { start: 'Start', end: 'End', coffee: 'Coffee', food: 'Food', sight: 'Sight', hotel: 'Sleep', viewpoint: 'Viewpoint', market: 'Market', fuel: 'Fuel' } as Record<string, string>,
  country: { comingSoon: 'Coming soon', explore: 'Explore' },
  search: {
    placeholder: 'Search an area, station or place',
    noMatch: 'Nothing matches that.',
    kindArea: 'Area',
    kindStation: 'Station',
    kindSubarea: (area: string) => `in ${area}`,
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
    areaSearch: 'Search areas',
    areaNoMatch: 'No area matches that.',
    removeArea: (label: string) => `Remove ${label}`,
    wholeArea: 'All',
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
