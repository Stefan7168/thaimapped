import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta, areaPhoto } from '@/lib/seo/page-meta'
import { hotelDoors, slimArea, slimRoute, stationsFor } from '@/lib/content/slim'
import { WeekendPage } from '@/components/weekend/weekend-page'
import { JsonLd, pinNode, placeListLd } from '@/lib/seo/json-ld'
import { borrowedSlots, weekendPlan } from '@/lib/explorer/weekend'
import { airportRoutesFor, railLegsBetween } from '@/lib/transit/from-airport'

// Static per area; the hotel budget rides along as ?price=min-max and is read in the browser.
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    liveCityIds().flatMap((city) => (loadCityBundle(city)?.areas ?? []).map((a) => ({ locale, city, area: a.id }))),
  )
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/weekend/[area]'>): Promise<Metadata> {
  const { locale, city, area } = await props.params
  if (!isLocale(locale)) return {}
  const a = loadCityBundle(city)?.areas.find((x) => x.id === area)
  if (!a) return {}
  const s = strings(locale)
  return pageMeta({ locale, title: s.weekendPage.title(t(a.name, locale)), description: s.weekendPage.description(t(a.name, locale), t(a.tagline, locale)), path: `/${locale}/${city}/weekend/${area}`, photo: areaPhoto(a) })
}

export default async function AreaWeekendPage(props: PageProps<'/[locale]/[city]/weekend/[area]'>) {
  const { locale, city, area } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  const a = bundle?.areas.find((x) => x.id === area)
  if (!bundle || !a) notFound()
  // Other areas are only named and linked; the stations are only the ones this area's places walk from.
  const cityName = t(bundle.city.name, locale)
  // A slot this area leaves empty borrows from the nearest area; those stops need their stations too.
  const borrowed = borrowedSlots(a, bundle.areas, weekendPlan(a))
  const borrowedPins = Object.values(borrowed).flatMap((b) => b.pins)
  const hotelStations = [...new Set(a.pins.filter((p) => p.kind === 'hotel' && p.walk).map((p) => p.walk!.station))]
  // Rides from each hotel's station to each stop's station, for the "or by train" line under a long walk.
  // Hotels of the other areas, as doors: a reader sleeping elsewhere gets the ride to this area's first station.
  const doors = hotelDoors(bundle.areas.filter((x) => x.id !== a.id))
  const elsewhereStations = [...new Set(Object.values(doors).flat().map((h) => h.walk?.station).filter((id): id is string => !!id))]
  const elsewhereRides = railLegsBetween(bundle, elsewhereStations, a.stations.slice(0, 1))
  const rides = railLegsBetween(bundle, hotelStations, [...a.pins, ...borrowedPins].filter((p) => p.kind !== 'hotel' && p.walk).map((p) => p.walk!.station))
  return (
    <>
      <JsonLd data={placeListLd(strings(locale).weekendPage.title(t(a.name, locale)), `/${locale}/${city}/weekend/${area}`, a.pins.map((p) => pinNode(p, locale, cityName)))} />
      <WeekendPage locale={locale} cityId={city} area={a} areas={bundle.areas.map(slimArea)} stations={stationsFor(bundle.stations, [...a.pins, ...borrowedPins], [...a.stations.slice(0, 1), ...elsewhereStations])} routes={loadRoutes(city).map(slimRoute)} borrowed={borrowed} airport={airportRoutesFor(bundle, hotelStations)} rides={rides} hotelDoors={doors} elsewhereRides={elsewhereRides} />
    </>
  )
}
