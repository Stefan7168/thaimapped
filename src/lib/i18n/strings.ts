import type { Locale } from '@/lib/content/types'

/**
 * UI strings. Every user-visible label lives here, keyed, so a second locale
 * is a second object and not a hunt through components.
 */
const en = {
  brand: 'ThaiMapped',
  nav: { cities: 'Cities', about: 'About' },
  country: { comingSoon: 'Coming soon', explore: 'Explore' },
  city: {
    areasHeading: 'Where to stay',
    areasIntro: 'Each area is a different trip. Tap one to fly there.',
    stationsHeading: 'Near a station',
    stationsIntro: 'Type a BTS or MRT station to see what is a short walk away.',
    stationPlaceholder: 'Station name, for example Asok',
    noStation: 'No station matches that.',
    walkMinutes: (n: number) => `${n} min walk`,
    from: (station: string) => `from ${station}`,
    flat: '2D',
    tilt: '3D',
    reset: 'Whole city',
  },
  pin: { hotel: 'Hotel', sight: 'Sight', food: 'Food', market: 'Market', nightlife: 'Nightlife', transport: 'Transport', placeholder: 'Placeholder' },
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
