import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle } from '@/lib/content/load'
import { stationPages } from '@/lib/explorer/stations'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { pageMeta, areaPhoto } from '@/lib/seo/page-meta'
import { slimArea, stationsFor } from '@/lib/content/slim'
import { AreaPage } from '@/components/area/area-page'
import { JsonLd, pinNode, placeListLd } from '@/lib/seo/json-ld'

export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    liveCityIds().flatMap((city) => (loadCityBundle(city)?.areas ?? []).map((a) => ({ locale, city, area: a.id }))),
  )
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/area/[area]'>): Promise<Metadata> {
  const { locale, city, area } = await props.params
  if (!isLocale(locale)) return {}
  const bundle = loadCityBundle(city)
  const a = bundle?.areas.find((x) => x.id === area)
  if (!bundle || !a) return {}
  const s = strings(locale)
  const hotels = a.pins.filter((p) => p.kind === 'hotel').length
  return pageMeta({ locale, title: s.areaPage.title(t(a.name, locale), t(bundle.city.name, locale)), description: s.areaPage.description(t(a.tagline, locale), hotels, a.pins.length - hotels, a.stations.length), path: `/${locale}/${city}/area/${area}`, photo: areaPhoto(a) })
}

/** One area as a page: what it is, its pictures, its stations, its places and its hotels, with the map beside it. */
export default async function AreaRoute(props: PageProps<'/[locale]/[city]/area/[area]'>) {
  const { locale, city, area } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  const a = bundle?.areas.find((x) => x.id === area)
  if (!bundle || !a) notFound()
  // Station id to the station page's address, for the stations that have one.
  const stationSlugs = Object.fromEntries(stationPages(bundle).flatMap((p) => p.stations.map((st) => [st.id, p.slug] as const)))
  const cityName = t(bundle.city.name, locale)
  return (
    <>
      <JsonLd data={placeListLd(strings(locale).areaPage.title(t(a.name, locale), cityName), `/${locale}/${city}/area/${area}`, a.pins.map((p) => pinNode(p, locale, cityName)))} />
      <AreaPage locale={locale} cityId={city} area={a} areas={bundle.areas.map(slimArea)} stations={stationsFor(bundle.stations, a.pins, a.stations)} stationSlugs={stationSlugs} />
    </>
  )
}
