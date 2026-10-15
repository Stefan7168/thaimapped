import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle } from '@/lib/content/load'
import { stationPages } from '@/lib/explorer/stations'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta } from '@/lib/seo/page-meta'
import { slimArea, stationsFor } from '@/lib/content/slim'
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
  const others = pages.filter((p) => p.slug !== slug).slice(0, 12).map((p) => ({ ...p, hotels: [], places: [] }))
  const pins = [...page.hotels, ...page.places].map((n) => n.pin)
  return <StationPage locale={locale} cityId={city} page={light} areas={[...slim.values()]} stations={stationsFor(bundle.stations, pins, page.stations.map((st) => st.id))} others={others} />
}
