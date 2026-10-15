import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { liveCityIds, loadCityBundle, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { WeekendPage } from '@/components/weekend/weekend-page'

// Static per area; the hotel budget rides along as ?price=min-max and is read in the browser.
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.flatMap((locale) =>
    liveCityIds().flatMap((city) => (loadCityBundle(city)?.areas ?? []).map((a) => ({ locale, city, area: a.id }))),
  )
}

export async function generateMetadata(props: PageProps<'/[locale]/[city]/weekend/[area]'>): Promise<Metadata> {
  const { locale, city, area } = await props.params
  if (!isLocale(locale)) return {}
  const a = loadCityBundle(city)?.areas.find((x) => x.id === area)
  if (!a) return {}
  const s = strings(locale)
  return { title: `${s.weekendPage.title(t(a.name, locale))} · ${s.brand}`, description: s.weekendPage.description(t(a.name, locale), t(a.tagline, locale)) }
}

export default async function AreaWeekendPage(props: PageProps<'/[locale]/[city]/weekend/[area]'>) {
  const { locale, city, area } = await props.params
  if (!isLocale(locale)) notFound()
  const bundle = loadCityBundle(city)
  const a = bundle?.areas.find((x) => x.id === area)
  if (!bundle || !a) notFound()
  return <WeekendPage locale={locale} cityId={city} area={a} areas={bundle.areas} stations={bundle.stations} routes={loadRoutes(city)} />
}
