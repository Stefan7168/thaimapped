import type { Locale, Pin, PinKind, RouteStop, StopKind, TripRoute } from '@/lib/content/types'
import { t } from '@/lib/i18n/locales'
import { env } from '@/lib/env'

/**
 * Structured data for search engines (schema.org as JSON-LD). Only what the
 * content really holds: a name, a position, the city, an official site where
 * one is known. No prices (ours are class estimates), no ratings, no opening
 * hours: nothing a crawler could mistake for a checked fact.
 */
type Node = Record<string, unknown>

const PIN_TYPES: Record<PinKind, string> = { hotel: 'LodgingBusiness', sight: 'TouristAttraction', food: 'Restaurant', market: 'TouristAttraction', nightlife: 'BarOrPub', transport: 'Place' }
const STOP_TYPES: Record<StopKind, string> = { start: 'Place', end: 'Place', coffee: 'CafeOrCoffeeShop', food: 'Restaurant', sight: 'TouristAttraction', hotel: 'LodgingBusiness', viewpoint: 'TouristAttraction', market: 'TouristAttraction', fuel: 'Place' }

function placeNode(type: string, name: string, lat: number, lon: number, cityName: string | null, official?: string): Node {
  const node: Node = {
    '@type': type,
    name,
    geo: { '@type': 'GeoCoordinates', latitude: Number(lat.toFixed(6)), longitude: Number(lon.toFixed(6)) },
  }
  // A trip's stops can lie far outside the city, so they carry no locality: the position says where they are.
  if (cityName) node.address = { '@type': 'PostalAddress', addressLocality: cityName, addressCountry: 'TH' }
  if (official) node.url = official
  return node
}

export function pinNode(pin: Pin, locale: Locale, cityName: string): Node {
  return placeNode(PIN_TYPES[pin.kind], t(pin.name, locale), pin.location.lat, pin.location.lon, cityName, pin.links.official)
}

function stopNode(stop: RouteStop, locale: Locale): Node {
  return placeNode(STOP_TYPES[stop.kind], t(stop.name, locale), stop.location.lat, stop.location.lon, null, stop.links.official)
}

/** A page that lists places: an area, a station, a weekend. */
export function placeListLd(name: string, path: string, items: Node[]): Node {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    url: `${env.siteUrl}${path}`,
    numberOfItems: items.length,
    itemListElement: items.map((item, i) => ({ '@type': 'ListItem', position: i + 1, item })),
  }
}

/** A trip page: the route as a tourist trip with its stops in order (placeholders left out: they are not real spots yet). */
export function tripLd(route: TripRoute, locale: Locale, path: string): Node {
  const stops = route.stops.filter((s) => !s.placeholder)
  return {
    '@context': 'https://schema.org',
    '@type': 'TouristTrip',
    name: t(route.name, locale),
    description: t(route.tagline, locale),
    url: `${env.siteUrl}${path}`,
    touristType: route.themes,
    itinerary: { '@type': 'ItemList', numberOfItems: stops.length, itemListElement: stops.map((s, i) => ({ '@type': 'ListItem', position: i + 1, item: stopNode(s, locale) })) },
  }
}

/** The site itself, on the home page. */
export function siteLd(name: string, description: string, locale: Locale): Node {
  return { '@context': 'https://schema.org', '@type': 'WebSite', name, description, url: `${env.siteUrl}/${locale}`, inLanguage: locale }
}

/** The script tag. `<` is escaped so a name can never close the tag. */
export function JsonLd({ data }: { data: Node }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }} />
}
