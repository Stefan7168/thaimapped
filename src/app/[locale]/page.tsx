import Link from 'next/link'
import { notFound } from 'next/navigation'
import { loadCountry, loadCity } from '@/lib/content/load'
import { LOCALES, isLocale, t } from '@/lib/i18n/locales'
import { strings } from '@/lib/i18n/strings'
import { SiteHeader } from '@/components/explorer/site-header'
import { SiteFooter } from '@/components/explorer/site-footer'

// Whole route static, so an unknown locale or city is a real 404 status, never a
// streamed 200 shell with a not-found body (search engines would index that).
export const ensureStatic = 'navigation'

export function generateStaticParams() {
  return LOCALES.map((locale) => ({ locale }))
}

export default async function CountryPage(props: PageProps<'/[locale]'>) {
  const { locale } = await props.params
  if (!isLocale(locale)) notFound()
  const s = strings(locale)
  const country = loadCountry()

  return (
    <>
      <SiteHeader locale={locale} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10">
        <h1 className="font-display text-4xl font-semibold tracking-tight sm:text-5xl">{t(country.name, locale)}</h1>
        <p className="mt-3 max-w-xl text-lg text-ink-2">{t(country.tagline, locale)}</p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2">
          {country.cities.map((c) => {
            const city = c.status === 'live' ? loadCity(c.id) : null
            const name = city ? t(city.name, locale) : c.id.replace(/-/g, ' ')
            return (
              <li key={c.id} className="rounded-xl border border-line bg-white/60 p-5">
                <h2 className="font-display text-2xl capitalize">{name}</h2>
                {city ? (
                  <>
                    <p className="mt-1 text-ink-2">{t(city.tagline, locale)}</p>
                    <Link href={`/${locale}/${c.id}`} className="mt-4 inline-block rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white">
                      {s.country.explore}
                    </Link>
                  </>
                ) : (
                  <p className="mt-1 text-sm text-ink-2">{s.country.comingSoon}</p>
                )}
              </li>
            )
          })}
        </ul>
      </main>
      <SiteFooter locale={locale} />
    </>
  )
}
