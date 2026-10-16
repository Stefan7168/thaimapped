import { notFound } from 'next/navigation'
import { liveCityIds, loadCity, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { hotelDoors } from '@/lib/content/slim'
import { railLegsBetween } from '@/lib/transit/from-airport'
import type { Metadata } from 'next'
import { LOCALES, isLocale } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta } from '@/lib/seo/page-meta'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'
import { TripList } from '@/components/explorer/trip-list'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => liveCityIds().map((city) => ({ locale, city })))
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/trip'>): Promise<Metadata> {
  const { locale, city } = await props.params
  if (!isLocale(locale)) return {}
  const s = strings(locale)
  return pageMeta({ locale, title: s.trip.heading, description: s.trip.intro, path: `/${locale}/${city}/trip` })
}

export default async function TripsIndexPage(props: PageProps<'/[locale]/[city]/trip'>) {
  const { locale, city } = await props.params
  if (!isLocale(locale)) notFound()
  const cityData = loadCity(city)
  if (!cityData) notFound()
  const routes = loadRoutes(city)
  // The saved hotel's ride to each trip's start, as the weekend page says it: hotel doors, start stations, and the rides between them.
  const bundle = loadCityBundle(city)
  const doors = hotelDoors(bundle?.areas ?? [])
  const tripStarts = Object.fromEntries(routes.flatMap((r) => (r.stops[0]?.station ? [[r.id, r.stops[0].station]] : [])))
  const tripRides = bundle ? railLegsBetween(bundle, Object.values(doors).flat().map((h) => h.walk?.station).filter((id): id is string => !!id), Object.values(tripStarts)) : {}
  return (
    <>
      <SiteHeader locale={locale} cityId={city} />
      <main className="flex-1">
        <TripList locale={locale} cityId={city} cityCamera={cityData.camera2d} routes={routes} hotelDoors={doors} tripStarts={tripStarts} tripRides={tripRides} />
      </main>
      <SiteFooter locale={locale} cityId={city} />
    </>
  )
}
