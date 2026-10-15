import { notFound } from 'next/navigation'
import { liveCityIds, loadCity, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale } from '@/lib/i18n/locales'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'
import { TripList } from '@/components/explorer/trip-list'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => liveCityIds().map((city) => ({ locale, city })))
}

export default async function TripsIndexPage(props: PageProps<'/[locale]/[city]/trip'>) {
  const { locale, city } = await props.params
  if (!isLocale(locale)) notFound()
  const cityData = loadCity(city)
  if (!cityData) notFound()
  const routes = loadRoutes(city)
  return (
    <>
      <SiteHeader locale={locale} cityId={city} />
      <main className="flex-1">
        <TripList locale={locale} cityId={city} cityCamera={cityData.camera2d} routes={routes} />
      </main>
      <SiteFooter locale={locale} cityId={city} />
    </>
  )
}
