import Link from 'next/link'
import { notFound } from 'next/navigation'
import { liveCityIds, loadCity, loadRoutes } from '@/lib/content/load'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'

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
        <ul className="mt-8 grid gap-4 sm:grid-cols-2">
          {routes.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-white/60 p-5">
              <h2 className="font-display text-2xl">{t(r.name, locale)}</h2>
              <p className="mt-1 text-ink-2">{t(r.tagline, locale)}</p>
              <p className="mt-2 text-xs text-ink-2">{s.trip.mode[r.mode]}, {s.trip.days(r.days)}{r.distanceKm !== undefined ? `, ${s.trip.km(r.distanceKm)}` : ''}</p>
              <Link href={`/${locale}/${city}/trip/${r.id}`} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">{s.country.explore}</Link>
            </li>
          ))}
        </ul>
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
