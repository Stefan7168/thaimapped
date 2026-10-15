import { notFound } from 'next/navigation'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale } from '@/lib/i18n/locales'
import { CityExplorer } from '@/components/explorer/city-explorer'

// Whole route static, so an unknown locale or city is a real 404 status, never a
// streamed 200 shell with a not-found body (search engines would index that).
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => liveCityIds().map((city) => ({ locale, city })))
}

export default async function CityPage(props: PageProps<'/[locale]/[city]'>) {
  const { locale, city } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  if (!bundle) notFound()
  return <CityExplorer locale={locale} bundle={bundle} routes={loadRoutes(city)} />
}
