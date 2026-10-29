import { notFound } from 'next/navigation'
import { distanceM } from '@/lib/explorer/filters'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { tripNights } from '@/lib/content/slim'
import { stationPages } from '@/lib/explorer/stations'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta } from '@/lib/seo/page-meta'
import { hotelDoors, slimArea, stationsFor } from '@/lib/content/slim'
import { railLegsBetween, airportRoutesFor } from '@/lib/transit/from-airport'
import { StationPage } from '@/components/station/station-page'
import { JsonLd, pinNode, placeListLd } from '@/lib/seo/json-ld'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    liveCityIds().flatMap((city) => {
      const bundle = loadCityBundle(city)
      return bundle ? stationPages(bundle).map((p) => ({ locale, city, slug: p.slug })) : []
    }),
  )
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/station/[slug]'>): Promise<Metadata> {
  const { locale, city, slug } = await props.params
  if (!isLocale(locale)) return {}
  const bundle = loadCityBundle(city)
  const page = bundle && stationPages(bundle).find((p) => p.slug === slug)
  if (!page) return {}
  const s = strings(locale)
  const st = page.stations[0]
  const label = `${st.code ? st.code + ' ' : ''}${t(st.name, locale)}`
  const photo = [...page.places, ...page.hotels].map((n) => n.pin.photo).find(Boolean) ?? null
  return pageMeta({ locale, title: s.stationPage.title(label), description: s.stationPage.description(label, page.hotels.length, page.places.length), path: `/${locale}/${city}/station/${slug}`, photo })
}

export default async function StationRoute(props: PageProps<'/[locale]/[city]/station/[slug]'>) {
  const { locale, city, slug } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  const pages = bundle ? stationPages(bundle) : []
  const page = pages.find((p) => p.slug === slug)
  if (!bundle || !page) notFound()
  // Each row names its area for the colour and the card; the outlines and the other pins stay out of the page.
  const slim = new Map(bundle.areas.map((a) => [a.id, slimArea(a)]))
  const rows = (list: typeof page.hotels) => list.map((n) => ({ ...n, area: slim.get(n.area.id) ?? slimArea(n.area) }))
  const light = { ...page, hotels: rows(page.hotels), places: rows(page.places) }
  // The twelve nearest station pages, nearest first, each with its straight-line distance from this one.
  const here = page.stations[0]
  const others = pages
    .filter((p) => p.slug !== slug)
    .map((p) => ({ ...p, hotels: [], places: [], km: Math.round(distanceM(here.lon, here.lat, p.stations[0].lon, p.stations[0].lat) / 100) / 10 }))
    .sort((a, b) => a.km - b.km)
    .slice(0, 12)
  const pins = [...page.hotels, ...page.places].map((n) => n.pin)
  // Rides from every hotel's station in the city to this page's stations, for the "from your hotel" line.
  const doors = hotelDoors(bundle.areas)
  const fromHotelRides = railLegsBetween(bundle, Object.values(doors).flat().map((h) => h.walk?.station).filter((id): id is string => !!id), page.stations.map((st) => st.id))
  const cityName = t(bundle.city.name, locale)
  const first = page.stations[0]
  return (
    <>
      <JsonLd data={placeListLd(`${first.code ? first.code + ' ' : ''}${t(first.name, locale)}`, `/${locale}/${city}/station/${slug}`, pins.map((p) => pinNode(p, locale, cityName)))} />
      <StationPage locale={locale} cityId={city} page={light} trips={tripNights(loadRoutes(city))} areas={[...slim.values()]} hotelDoors={doors} fromHotelRides={fromHotelRides} stations={stationsFor(bundle.stations, pins, page.stations.map((st) => st.id))} others={others} airport={airportRoutesFor(bundle, [...new Set(page.hotels.map((h) => h.pin).filter((p) => p.kind === 'hotel' && p.walk).map((p) => p.walk!.station))])} />
    </>
  )
}
