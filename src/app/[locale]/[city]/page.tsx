import { notFound } from 'next/navigation'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import type { Metadata } from 'next'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta, areaPhoto } from '@/lib/seo/page-meta'
import { CityExplorer } from '@/components/explorer/city-explorer'

// Whole route static, so an unknown locale or city is a real 404 status, never a
// streamed 200 shell with a not-found body (search engines would index that).
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) => liveCityIds().map((city) => ({ locale, city })))
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]'>): Promise<Metadata> {
  const { locale, city } = await props.params
  if (!isLocale(locale)) return {}
  const bundle = loadCityBundle(city)
  if (!bundle) return {}
  const s = strings(locale)
  return pageMeta({ locale, title: s.explorerPage.title(t(bundle.city.name, locale)), description: t(bundle.city.tagline, locale), path: `/${locale}/${city}`, photo: bundle.areas.map(areaPhoto).find(Boolean) })
}

export default async function CityPage(props: PageProps<'/[locale]/[city]'>) {
  const { locale, city } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  if (!bundle) notFound()
  return <CityExplorer locale={locale} bundle={bundle} routes={loadRoutes(city)} />
}
