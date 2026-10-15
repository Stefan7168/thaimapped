import { notFound } from 'next/navigation'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import type { Metadata } from 'next'
import { LOCALES, isLocale } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta } from '@/lib/seo/page-meta'
import { thinRoute } from '@/lib/content/slim'
import { JsonLd, siteLd } from '@/lib/seo/json-ld'
import { HomePage } from '@/components/home/home-page'

// Whole route static, so an unknown locale is a real 404 status, never a
// streamed 200 shell with a not-found body (search engines would index that).
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export async function generateMetadata(props: PageProps<'/[locale]'>): Promise<Metadata> {
  const { locale } = await props.params
  if (!isLocale(locale)) return {}
  const s = strings(locale)
  return pageMeta({ locale, title: s.home.headline, description: s.home.intro[0], path: `/${locale}` })
}

/** The country page is the first live city on a stage: Bangkok until the others go live. */
export default async function CountryPage(props: PageProps<'/[locale]'>) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()
  const cityId = liveCityIds()[0]
  const bundle = cityId ? loadCityBundle(cityId) : null
  if (!bundle) notFound()
  const s = strings(locale)
  return (
    <>
      <JsonLd data={siteLd(s.brand, s.home.intro[0], locale)} />
      <HomePage locale={locale} bundle={bundle} routes={loadRoutes(bundle.city.id).map(thinRoute)} />
    </>
  )
}
