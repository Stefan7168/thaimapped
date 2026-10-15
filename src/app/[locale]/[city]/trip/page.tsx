import { notFound } from 'next/navigation'
import { liveCityIds, loadCity, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
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
  const s = strings(locale)
  const routes = loadRoutes(city)
  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight">{s.trip.heading}</h1>
        <p className="mt-2 max-w-xl text-ink-2">{s.trip.intro}</p>
        <TripList locale={locale} cityId={city} routes={routes} />
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
