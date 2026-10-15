import { notFound } from 'next/navigation'
import { liveCityIds, loadCity, loadRoute, loadRoutes } from '@/lib/content/load'
import type { Metadata } from 'next'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { pageMeta } from '@/lib/seo/page-meta'
import { TripPage } from '@/components/explorer/trip-page'

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
  return <TripPage locale={locale} cityId={city} cityName={t(cityData.name, locale)} route={routeData} />
}
