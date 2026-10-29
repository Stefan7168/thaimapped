import { notFound } from 'next/navigation'
import { liveCityIds, loadCity, loadCityBundle, loadRoute, loadRoutes } from '@/lib/content/load'
import type { Metadata } from 'next'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { pageMeta } from '@/lib/seo/page-meta'
import { JsonLd, tripLd } from '@/lib/seo/json-ld'
import { TripPage } from '@/components/explorer/trip-page'
import { hotelDoors } from '@/lib/content/slim'
import { railLegsBetween } from '@/lib/transit/from-airport'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => liveCityIds().flatMap((city) => loadRoutes(city).map((r) => ({ locale, city, route: r.id }))))
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/trip/[route]'>): Promise<Metadata> {
  const { locale, city, route } = await props.params
  if (!isLocale(locale)) return {}
  const r = loadRoute(city, route)
  if (!r) return {}
  return pageMeta({ locale, title: t(r.name, locale), description: t(r.tagline, locale), path: `/${locale}/${city}/trip/${route}` })
}

export default async function TripRoutePage(props: PageProps<'/[locale]/[city]/trip/[route]'>) {
  const { locale, city, route } = await props.params
  if (!isLocale(locale)) notFound()
  const cityData = loadCity(city)
  const routeData = cityData ? loadRoute(city, route) : null
  if (!cityData || !routeData) notFound()
  const bundle = loadCityBundle(city)
  const doors = hotelDoors(bundle?.areas ?? [])
  const start = routeData.stops[0]?.station
  const hotelStations = Object.values(doors).flat().map((h) => h.walk?.station).filter((id): id is string => !!id)
  const startRides = bundle && start ? railLegsBetween(bundle, hotelStations, [start]) : {}
  return (
    <>
      <JsonLd data={tripLd(routeData, locale, `/${locale}/${city}/trip/${route}`)} />
      <TripPage locale={locale} cityId={city} cityName={t(cityData.name, locale)} route={routeData} hotelDoors={doors} startRides={startRides} others={loadRoutes(city).filter((r) => r.id !== route).map((r) => ({ id: r.id, name: r.name, days: r.days, duration: r.duration }))} />
    </>
  )
}
