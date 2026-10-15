import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle } from '@/lib/content/load'
import { stationPages } from '@/lib/explorer/stations'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { StationPage } from '@/components/station/station-page'

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
  return { title: `${s.stationPage.title(label)} · ${s.brand}`, description: s.stationPage.description(label, page.hotels.length, page.places.length) }
}

export default async function StationRoute(props: PageProps<'/[locale]/[city]/station/[slug]'>) {
  const { locale, city, slug } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  const pages = bundle ? stationPages(bundle) : []
  const page = pages.find((p) => p.slug === slug)
  if (!bundle || !page) notFound()
  return <StationPage locale={locale} cityId={city} page={page} areas={bundle.areas} stations={bundle.stations} others={pages.filter((p) => p.slug !== slug).slice(0, 12)} />
}
